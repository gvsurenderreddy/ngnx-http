# NGNX.http.Server

This is an NGN extension that simplifies common web serving. It's a _slightly_
opinionated implementation of [express](http://expressjs.com) that enforces
good practices and simplifies development.

The following features are built in:

1. Simple Routing
1. Automatic Refresh
1. CORS support
1. TLS/SSL support
1. Autostart

## Usage

```js
require('ngn')
require('ngnx-http')

let server = new NGNX.http.Server({
  poweredby: 'Acme Corp.'
})

server.createRoutes('./path/to/routes')
```

The code above will automatically start a web server on port 80 using the
routes defined in `/path/to/routes.js`. That file may look like:

```js
module.exports = function (app) {
  app.get('/echo', function (req, res) {
    res.status(200).send(req.body)
  })

  app.get('/ping', function (req, res) {
    res.sendStatus(200)
  })
}
```

We like to use a variation of this that relies on separating functionality into
modules:

```js
module.exports = function (app) {
  let auth = require('./tokenauth.js')
  let users = require('./my/users')

  app.post('/user', auth.required, users.create)
  app.get('/user/:id', auth.required, users.read)
  app.put('/user/:id', auth.required, users.update)
  app.delete('/user/:id', auth.required, users.delete)
  app.get('/users', users.list)
}
```

### Automatic Refresh

By default, automatic refresh is enabled. It's better to turn this off in
production (which can be done through an environment variable), but it can
really speed up development.

The `server.createRoutes()` method is unique. It identifies files like the
example above and adds the routes. It also monitors these files for changes
and updates the server without restarting it (hot-route-loading).
When a file is removed, it's routes are removed. When a file is modified, the
routes are synchronized.

It's unlikely that a file will be deleted and recreated, but if it is, the
routes will automatically be added when the file is re-added.
