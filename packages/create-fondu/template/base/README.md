# {{name}}

A [Fondu](https://fondu.dev) app: full-stack React on Hono and Vite, on {{target}}.

{{scripts}}

```
app/
  server.ts       the Hono app: export default createApp()
  routes/         the file path is the URL (index.tsx: /, users/[id].tsx: /users/:id)
    index.tsx     a page: its loader (server code) and the page component (default export)
    _layout.tsx   around every page (a directory's _layout.tsx: around its pages)
    _error.tsx    the error page (404, 500…)
  styles/app.css  Tailwind CSS
```

`loader` is GET, `action` POST, `actions.name` POST `?name`; plain HTTP routes are `.ts` files exporting `GET`,
`POST`… Everything else (props, validation, errors, server rendering): the [Fondu docs](https://fondu.dev/docs).
