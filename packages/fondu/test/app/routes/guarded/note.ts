import { defineHandler } from 'fondu'

// every method that takes a body: the size it got
const size = defineHandler(async (c) => c.text(String((await c.req.arrayBuffer()).byteLength)))
export const POST = size
export const PUT = size
export const PATCH = size
export const DELETE = size
