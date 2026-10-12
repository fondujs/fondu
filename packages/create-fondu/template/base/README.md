# {{name}}

A [Fondu](https://github.com/fondujs/fondu) app: Inertia v3 on Hono, on {{target}}.

{{scripts}}

```
app/
  server.ts       the Hono app: export default createApp()
  app.tsx         the Inertia app (browser and server render)
  routes/         server code; the file path is the URL (index.ts: /, users/[id].ts: /users/:id)
  pages/          React pages, rendered by name: render(c, 'index') is pages/index.tsx; named after its route where it can be
  layout.tsx      around every page
  styles/app.css  Tailwind CSS
```

`loader` is GET, `action` POST, `actions.name` POST `?name`; plain HTTP routes export `GET`, `POST`… Everything else
(props, validation, errors, server rendering): the [Fondu README](https://github.com/fondujs/fondu#readme), and the
[Inertia docs](https://inertiajs.com) for the browser side.
