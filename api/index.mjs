// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json) and handled
// by the same Express app the local server runs. Imports the compiled server, built before this.
export { app as default } from '../server/dist/app.js'
