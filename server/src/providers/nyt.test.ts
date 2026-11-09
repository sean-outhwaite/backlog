import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/env.js', () => ({ env: {} }))

const { interleaveBestsellers } = await import('./nyt.js')

const nytBook = (title: string, isbn: string) => ({
  title,
  author: 'Author',
  primary_isbn13: isbn,
  isbns: [{ isbn13: isbn }, { isbn13: '' }],
})

describe('interleaveBestsellers', () => {
  it("takes each list's #1, then each #2, once per book, skipping lists it doesn't use", () => {
    const books = interleaveBestsellers({
      results: {
        lists: [
          { list_name_encoded: 'picture-books', books: [nytBook('PICTURE', '9')] },
          { list_name_encoded: 'trade-fiction-paperback', books: [nytBook('VERITY', '3'), nytBook('FIC 2', '2')] },
          {
            list_name_encoded: 'combined-print-and-e-book-fiction',
            books: [nytBook('FIC 1', '1'), nytBook('FIC 2', '2')],
          },
          { list_name_encoded: 'combined-print-and-e-book-nonfiction', books: [nytBook('NON 1', '4')] },
        ],
      },
    })
    expect(books.map((book) => book.title)).toEqual(['FIC 1', 'NON 1', 'VERITY', 'FIC 2'])
    expect(books[0].isbns).toEqual(['1'])
  })
})
