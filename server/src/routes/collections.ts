import { Router } from 'express'
import { z } from 'zod'
import type { Collection } from '@prisma/client'
import type { AuthedRequest } from '../middleware/auth.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { collectionSummaries, ensurePicks, friendsPicksFeed } from '../lib/collections.js'
import { areFriends } from '../lib/friendship.js'
import { externalIdSchema, mediaRefSchema, resolveMediaItem, type MediaRef } from '../lib/mediaItems.js'
import { sourceByType } from '../providers/index.js'
import { isUniqueConstraintError, prisma } from '../lib/prisma.js'

export const collectionsRouter = Router()

const noteSchema = z.string().trim().max(280)
const nameSchema = z.string().trim().min(1).max(60)
const descriptionSchema = z.string().trim().max(280)

// Your own lists, each saying whether it holds `contains`. Your picks list is made here the first
// time, so there's always one to show.
async function ownSummaries(userId: string, contains?: MediaRef) {
  const collections = await collectionSummaries(userId, { contains })
  if (collections.some((collection) => collection.kind === 'picks')) return collections
  await ensurePicks(userId)
  return collectionSummaries(userId, { contains })
}

collectionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    res.json(await ownSummaries(userId))
  }),
)

const containingQuerySchema = z.union([
  z.object({ mediaItemId: z.uuid() }),
  z.object({
    type: z.enum(['movie', 'tv', 'book', 'game']),
    externalId: externalIdSchema,
    kind: z.enum(['title', 'series']).default('title'),
  }),
])

// For the "Add to list" picker: your lists, which of them hold this title, and the title's
// MediaItem id (null if nobody's stored it yet), so it can be taken off a list again.
collectionsRouter.get(
  '/containing',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const parsed = containingQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ error: z.flattenError(parsed.error) })
      return
    }
    const ref = parsed.data
    const [collections, mediaItem] = await Promise.all([
      ownSummaries(userId, ref),
      'mediaItemId' in ref
        ? { id: ref.mediaItemId }
        : prisma.mediaItem.findUnique({
            where: {
              source_type_kind_externalId: {
                source: sourceByType[ref.type],
                type: ref.type,
                kind: ref.kind,
                externalId: ref.externalId,
              },
            },
            select: { id: true },
          }),
    ])
    res.json({ mediaItemId: mediaItem?.id ?? null, collections })
  }),
)

collectionsRouter.get(
  '/feed',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    res.json(await friendsPicksFeed(userId))
  }),
)

const createSchema = z.object({ name: nameSchema, description: descriptionSchema.optional() })

collectionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: z.flattenError(parsed.error) })
      return
    }
    const collection = await prisma.collection.create({
      data: { ownerId: userId, name: parsed.data.name, description: parsed.data.description || null },
    })
    res.status(201).json({ ...collection, itemCount: 0, covers: [] })
  }),
)

// The list you mean by `id`, if it's yours: "picks" means your picks list, made if need be.
async function ownCollection(userId: string, id: string): Promise<Collection | null> {
  if (id === 'picks') return ensurePicks(userId)
  const collection = await prisma.collection.findUnique({ where: { id } })
  return collection?.ownerId === userId ? collection : null
}

// A list with its items, for its owner or their friends.
collectionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const collection =
      req.params.id === 'picks'
        ? await ensurePicks(userId)
        : await prisma.collection.findUnique({ where: { id: req.params.id } })
    if (!collection) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    const isOwn = collection.ownerId === userId
    // The friendship check, owner and items are independent, so they share one round trip.
    const [allowed, owner, items] = await Promise.all([
      isOwn || areFriends(userId, collection.ownerId),
      prisma.profile.findUniqueOrThrow({
        where: { id: collection.ownerId },
        select: { id: true, username: true, avatarUrl: true },
      }),
      prisma.collectionItem.findMany({
        where: { collectionId: collection.id },
        include: { mediaItem: true },
        orderBy: { addedAt: 'desc' },
      }),
    ])
    if (!allowed) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({ ...collection, owner, isOwn, items })
  }),
)

const updateSchema = z.object({ name: nameSchema.optional(), description: descriptionSchema.nullable().optional() })

collectionsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: z.flattenError(parsed.error) })
      return
    }
    const collection = await ownCollection(userId, req.params.id)
    if (!collection) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    // Picks keeps its name, so friends always know what it is.
    const { name, description } = parsed.data
    const updated = await prisma.collection.update({
      where: { id: collection.id },
      data: {
        ...(name !== undefined && collection.kind !== 'picks' && { name }),
        ...(description !== undefined && { description: description || null }),
      },
    })
    res.json(updated)
  }),
)

collectionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const { count } = await prisma.collection.deleteMany({
      where: { id: req.params.id, ownerId: userId, kind: 'custom' },
    })
    res.status(count ? 204 : 404).end()
  }),
)

const addItemSchema = z.object({ note: noteSchema.optional() }).and(mediaRefSchema)

// Adds a title (or, if it's already there, updates its note).
collectionsRouter.post(
  '/:id/items',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const parsed = addItemSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: z.flattenError(parsed.error) })
      return
    }
    const [collection, mediaItem] = await Promise.all([
      ownCollection(userId, req.params.id),
      resolveMediaItem(parsed.data),
    ])
    if (!collection || !mediaItem) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    const note = parsed.data.note || null
    try {
      const item = await prisma.collectionItem.create({
        data: { collectionId: collection.id, mediaItemId: mediaItem.id, note },
      })
      res.status(201).json({ ...item, mediaItem })
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error
      const item = await prisma.collectionItem.update({
        where: { collectionId_mediaItemId: { collectionId: collection.id, mediaItemId: mediaItem.id } },
        data: parsed.data.note === undefined ? {} : { note },
      })
      res.json({ ...item, mediaItem })
    }
  }),
)

const updateItemSchema = z.object({ note: noteSchema.nullable() })

collectionsRouter.patch(
  '/:id/items/:mediaItemId',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const parsed = updateItemSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: z.flattenError(parsed.error) })
      return
    }
    const collection = await ownCollection(userId, req.params.id)
    if (!collection) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const { count } = await prisma.collectionItem.updateMany({
      where: { collectionId: collection.id, mediaItemId: req.params.mediaItemId },
      data: { note: parsed.data.note || null },
    })
    res.status(count ? 204 : 404).end()
  }),
)

collectionsRouter.delete(
  '/:id/items/:mediaItemId',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const collection = await ownCollection(userId, req.params.id)
    if (!collection) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    await prisma.collectionItem.deleteMany({
      where: { collectionId: collection.id, mediaItemId: req.params.mediaItemId },
    })
    res.status(204).end()
  }),
)
