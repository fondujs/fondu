# {{name}}

A [Fondu](https://fondu.dev) app: full-stack React on Hono and Vite, on {{target}}.

{{scripts}}

```
app/
  server.ts       the Hono app: export default createApp()
  app.tsx         the app (browser and server render)
  routes/         server code; the file path is the URL (index.ts: /, users/[id].ts: /users/:id)
  pages/          React pages, rendered by name: render(c, 'index') is pages/index.tsx; named after its route where it can be
    _layout.tsx   around every page (a directory's _layout.tsx: around its pages)
  styles/app.css  Tailwind CSS
```

`loader` is GET, `action` POST, `actions.name` POST `?name`; plain HTTP routes export `GET`, `POST`… Everything else
(props, validation, errors, server rendering): the [Fondu docs](https://fondu.dev/docs).
