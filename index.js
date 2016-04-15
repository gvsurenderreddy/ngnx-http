'use strict'

const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
const watch = require('watch')

/**
 * @class NGNX.http.Server
 * The NGN HTTP server is an express-based server designed to simplify
 * development and handle the most common HTTP serving needs. It is not
 * designed for every situation, only the most comon. While this web server
 * does support SSL, it was designed primarily to sit behind an SSL terminator,
 * serving content from a trusted network.
 * @requires express
 * @requires cors
 * @requires watch
 * @fires start
 * Fired when the server startup is complete.
 * @fires stop
 * Fired when the server stops and shuts down.
 */
class HttpServer extends NGN.Server {
  constructor(cfg) { // eslint-disable-line
    // General configuration
    cfg = cfg || {}

    // Instantiate super constructor
    super(cfg)

    // Private properties
    Object.defineProperties(this, {
      /**
       * @property {Object} app
       * A reference to the underlying express app.
       * @private
       */
      app: {
        enumerable: true,
        configurable: false,
        writable: false,
        value: express()
      },

      /**
       * @cfgproperty {number} [port=80/443]
       * The port on which the server is listening.
       * By default, this is `80`, or `443` if a TLS certifcate is specified.
       * @readonly
       */
      portnumber: {
        enumerable: true,
        configurable: false,
        writable: true,
        value: NGN.coalesce(cfg.port, (cfg.certificate ? 443 : 80))
      },

      /**
       * @cfg {string} [ip]
       * The IP/NIC to listen on. By default, the server listens on all.
       */
      ip: {
        enumerable: true,
        configurable: false,
        writable: false,
        value: cfg.ip || '0.0.0.0'
      },

      /**
       * @cfgproperty {string} certificate
       * Path to an SSL certificate or the contents of the certificate.
       */
      crt: {
        enumerable: false,
        configurable: false,
        writable: true,
        value: cfg.certificate || null
      },

      /**
       * @cfgproperty {string} key
       * Path to a private key or the contents of the key.
       */
      privkey: {
        enumerable: false,
        configurable: false,
        writable: true,
        value: cfg.key || null
      },

      /**
       * @cfgproperty {string} ca
       * Path to a certificate authority certificate/bundle or the contents of
       * the certificate/bundle.
       */
      certauthority: {
        enumerable: false,
        configurable: false,
        writable: true,
        value: cfg.ca || null
      },

      /**
       * @cfgproperty {string} passphrase
       * A passphrase used to read an encrypted private key.
       */
      keypass: {
        enumerable: false,
        configurable: false,
        writable: true,
        value: cfg.passphrase || null
      },

      /**
       * @cfg {Boolean} [refresh=true]
       * Setting this to `true` turns on a file watcher.
       * Anytime a file change is detected, the routes will be automatically
       * reloaded without requiring a server restart.
       */
      refresh: {
        enumerable: true,
        writable: false,
        configurable: false,
        value: NGN.coalesce(cfg.refresh, true)
      },

      /**
       * @cfg {string} poweredby
       * Sets the `X-POWERED-BY` HTTP header.
       */
      poweredby: {
        enumerable: true,
        configurable: false,
        writable: true,
        value: cfg.poweredby || 'NGN'
      },

      /**
       * @property {object} managedroutes
       * The modules being monitored for route changes.
       */
      managedroutes: {
        enumerable: false,
        writable: true,
        configurable: false,
        value: {}
      },

      /**
       * @property {Object} monitors
       * A collection of the file watchers used to auto-refresh routes.
       * @private
       */
      monitors: {
        enumerable: false,
        configurable: false,
        writable: true,
        value: {}
      },

      /**
       * @cfg {Array|String} [whitelist=*]
       * A whitelist of domains allowed to access the server.
       * This activates CORS by setting the `Access-Control-Allow-Origin` header.
       * A whitelist will always override a blacklist. By default, all sources
       * are accepted.
       */
      whitelist: {
        enumerable: false,
        configurable: false,
        writable: true,
        value: cfg.whitelist ? (Array.isArray(cfg.whitelist) ? cfg.whitelist : [cfg.whitelist]) : []
      },

      /**
       * @cfg {Array|String} blacklist
       * A blacklist of domains **not** allowed to access the server.
       * This activates CORS by setting the `Access-Control-Allow-Origin` header.
       * A whitelist will always override a blacklist. By default, nothing is
       * blocked/blacklisted.
       */
      blacklist: {
        enumerable: false,
        configurable: false,
        writable: true,
        value: cfg.blacklist ? (Array.isArray(cfg.blacklist) ? cfg.blacklist : [cfg.blacklist]) : []
      },

      /**
       * @cfg {Array|String} allowedMethods
       * A list of HTTP methods acccepted by this server.
       * This activates CORS by setting the `Access-Control-Allow-Methods` header.
       */
      allowedMethods: {
        enumerable: false,
        configurable: false,
        writable: true,
        value: cfg.allowedMethods ? (Array.isArray(cfg.allowedMethods) ? cfg.allowedMethods : [cfg.allowedMethods]) : []
      },

      /**
       * @cfg {Array|String} allowedHeaders
       * A list of HTTP headers acccepted by this server.
       * This activates CORS by setting the `Access-Control-Allow-Headers` header.
       * If this is not specified, the `Access-Control-Request-Headers` headers
       * are used (i.e. response mirrors the request).
       */
      allowedHeaders: {
        enumerable: false,
        configurable: false,
        writable: true,
        value: cfg.allowedHeaders ? (Array.isArray(cfg.allowedHeaders) ? cfg.allowedHeaders : [cfg.allowedHeaders]) : []
      },

      /**
       * @cfg {Array|String} exposedHeaders
       * A list of HTTP headers exposed by this server.
       * This activates CORS by setting the `Access-Control-Expose-Headers` header.
       */
      exposedHeaders: {
        enumerable: false,
        configurable: false,
        writable: true,
        value: cfg.exposedHeaders ? (Array.isArray(cfg.exposedHeaders) ? cfg.exposedHeaders : [cfg.exposedHeaders]) : []
      },

      /**
       * @cfg {boolean} [credentials=false]
       * Set to `true` to enable passing of credentials to the server (example: basic auth).
       * This activates CORS by setting the `Access-Control-Allow-Credentials` header,
       * otherwise it's omitted.
       */
      credentials: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: NGN.coalesce(cfg.credentials, false)
      },

      /**
       * @cfg {number} maxAge
       * Set this to an integer to enable the `Access-Control-Allow-Max-Age` header.
       * This automatically activates CORS.
       */
      maxAge: {
        enumerable: false,
        configurable: false,
        writable: false,
        value: cfg.maxAge || cfg.maxage || null
      }
    })

    if (this.refresh) {
      console.warn('Automatic route refresh is enabled. This is only recommended for development environments.')
    }

    /**
     * @method app.cors
     * A reference to the underlying Express CORS engine.
     * This is for use within routes.
     */
    this.app.cors = this.CORS
  }

  /**
   * @property {function} CORS
   * A reference to the underlying Express CORS engine.
   */
  get CORS() { // eslint-disable-line
    return cors
  }

  /**
   * @property {number} port
   * The port on which the server is listening.
   */
  get port() { // eslint-disable-line
    return this.portnumber
  }

  /**
   * @property {string} ca
   * The contents of the Certificate Authority SSL certificate.
   */
  get ca() { // eslint-disable-line
    if (NGN.util.pathReadable(this.certauthority)) {
      this.certauthority = fs.readFileSync(this.certauthority).toString()
    }
    return this.certauthority
  }

  /**
   * @property {string} certificate
   * The contents of the SSL certificate.
   */
  get certificate() { // eslint-disable-line
    if (NGN.util.pathReadable(this.crt)) {
      this.crt = fs.readFileSync(this.crt)
    }
    return this.crt
  }

  /**
   * @property {string} key
   * The contents of the SSL private key.
   */
  get key() { // eslint-disable-line
    if (NGN.util.pathReadable(this.privkey)) {
      this.privkey = fs.readFileSync(this.privkey)
    }
    return this.privkey
  }

  /**
   * @property {string} passphrase
   * The cencryption passphrase for the SSL private key.
   * @private
   */
  get passphrase() { // eslint-disable-line
    if (NGN.util.pathReadable(this.keypass)) {
      this.keypass = fs.readFileSync(this.keypass)
    }
    return this.keypass
  }

  /**
   * @property {string} poweredbyHeader
   * The branding associated with the server.
   */
  get poweredbyHeader() { // eslint-disable-line
    return this.poweredby || null
  }

  start() { // eslint-disable-line
    let me = this
    this._starting = true

    if (this.poweredbyHeader) {
      this.app.use(function (req, res, next) {
        res.set('x-powered-by', me.poweredbyHeader)
        next()
      })
    } else {
      this.app.disable('x-powered-by')
    }

    // SSL
    if (this.crt) {
      let opts = {
        certificate: this.certificate
      }
      if (this.certauthority) {
        opts.ca = this.certauthority
      }
      if (this.privkey) {
        opts.key = this.privkey
      }
      this.server = require('https').createServer(opts, this.app)
    } else {
      this.server = require('http').Server(this.app)
    }

    if (this.portnumber <= 0) {
      let c = require('net').createServer()
      c.listen(0, function () {
        me.portnumber = c.address().port
        c.close(function () {
          me.server.listen(me.portnumber, me.ip, function () {
            me._running = true
            me._starting = false
            me.portnumber = me.server.address().port
            me.emit('start')
            console.info('Server running at', me.ip + ':' + me.portnumber)
          })
        })
      })
    } else {
      this.server.listen(this.portnumber, this.ip, function () {
        me._running = true
        me._starting = false
        me.portnumber = me.server.address().port
        me.emit('start')
        console.info('Server running at', me.ip + ':' + me.portnumber)
      })
    }
  }

  stop() { // eslint-disable-line
    let me = this
    this.server.on('close', function () {
      this._running = false
      me.emit('stop')
    })
    Object.keys(this.monitors).forEach(function (m) {
      me.monitors[m].monitor.stop()
    })
    this.server.close()
  }

  /**
   * @method createRoutes
   * Add routes that are monitored.
   * @param {string} filepath
   * The path to the module containing the routes.
   * This acts as a `require`. For example:
   * ```js
   * server.createRoutes('./myroutes.js')
   * ```
   * This is essentially the equivalent of:
   * ```js
   * require('./myroutes.js')(server.app)
   * ```
   * The primary difference is createRoutes associates
   * a file with the route/s. When this file changes,
   * the router will reload itself without restarting the
   * process (hot reload).
   *
   * This can also accept a module object, but it will not be tracked.
   * For example:
   * ```js
   * let mymod = require('./myroutes.js')
   * server.createRoutes(mymod)
   * ```
   * The example above will still work, but it will not auto-refresh.
   */
  createRoutes(mod) { // eslint-disable-line
    if (typeof mod === 'string') {
      if (!NGN.util.pathExists(path.resolve(mod))) {
        if (path.extname(mod) !== '.js') {
          mod = mod + '.js'
        }
        if (!NGN.util.pathExists(path.resolve(mod))) {
          mod = path.join(process.cwd(), mod)
        }
        if (NGN.util.pathExists(mod)) {
          mod = path.join(process.cwd(), mod)
        }
      }
      if (NGN.util.pathExists(mod)) {
        let before = this.app._router ? this.routes.length - 2 : 0
        if (require.cache.hasOwnProperty(mod)) {
          delete require.cache[mod]
        }
        require(mod)(this.app)
        this.managedroutes[mod] = [before + 2, this.routes.length - 1]
        this.monitor(mod)
      }
    } else {
      mod(this.app)
    }
  }

  /**
   * @method fileFilter
   * A method for filtering which monitored files within a directory emit a
   * change event.
   * @private
   * @param  {string} dir
   * The absolute path of the directory being monitored.
   * @return {boolean}
   * Indicator that the file should be filtered out of the resultset.
   */
  fileFilter(dir) { // eslint-disable-line
    let me = this
    return function (filepath) {
      if (!me.monitors.hasOwnProperty(dir)) {
        return false
      }
      if (!me.monitors[dir].hasOwnProperty('files')) {
        return false
      }
      return me.monitors[dir].files.indexOf(filepath) >= 0
    }
  }

  /**
   * @method getModules
   * Return the node modules that have been "required" in the app.
   * @private
   * @return {Array}
   * A list of the modules be reference.
   */
  getModules() { // eslint-disable-line
    // Get all of the required local modules (i.e. part of the project, not the core)
    return Object.keys(require.cache).filter(function (p) {
      return p.indexOf(process.cwd()) === 0 && p.indexOf('node_modules') < 0
    }).map(function (p) {
      return path.resolve(path.join(process.cwd(), p.replace(__dirname, '').replace(process.cwd(), '')))
    })
  }

  /**
   * @method monitor
   * Monitor a file for file changes. This enables route hot-reloading.
   * @private
   * @param  {string} filepath
   * The path of the file to monitor.
   */
  monitor(filepath) { // eslint-disable-line
    // If auto-refresh isn't active, ignore this.
    if (!this.refresh) {
      return
    }

    let me = this
    let dir = path.dirname(filepath)
    if (me.monitors[dir] === undefined) {
      me.monitors[dir] = {
        files: []
      }
      watch.createMonitor(dir, {
        ignoreDotFiles: true,
        filter: me.fileFilter(dir),
        ignoreUnreadableDir: true,
        ignoreNotPermitted: true,
        ignoreDirectoryPattern: '/node_modules/'
      }, function (m) {
        m.on('created', function (f) {
          me.reloadRoutes(f)
        })
        m.on('changed', function (f) {
          me.reloadRoutes(f)
        })
        m.on('removed', function (f) {
          me.reloadRoutes(f)
        })
        me.monitors[dir].monitor = m
        me.monitors[dir].files.push(filepath)
      })
    }
    if (me.monitors[dir].files.indexOf(filepath) < 0) {
      me.monitors[dir].files.push(filepath)
      console.log('Watching', filepath)
    }
  }

  /**
   * @method reindexRoutes
   * Routes are indexed so they can be referenced and reloaded.
   * This reindexes routes by removing a range of routes. This is
   * primarily used for reloading routes appropriately.
   * @param  {number} start
   * Starting index.
   * @param  {number} end
   * Ending index.
   * @private
   */
  reindexRoutes(start, end) { // eslint-disable-line
    let me = this
    Object.keys(this.managedroutes).forEach(function (filepath) {
      if (me.managedroutes[filepath][0] > end) {
        me.managedroutes[filepath][0] = me.managedroutes[filepath][0] - start
        me.managedroutes[filepath][1] = me.managedroutes[filepath][1] - end
      }
    })
  }

  /**
   * @method reloadRoutes
   * Refresh the routes.
   * @private
   * @param  {string} filepath
   * The path to reload routes from.
   */
  reloadRoutes(f) { // eslint-disable-line
    // If auto-refresh isn't active, ignore this.
    if (!this.refresh) {
      return
    }
    this.routes.splice(this.managedroutes[f][0], (this.managedroutes[f][1] - this.managedroutes[f][0]) + 1)
    this.reindexRoutes(this.managedroutes[f][0], this.managedroutes[f][1])
    delete this.managedroutes[f]
    this.createRoutes(f)
    console.info('Routes reloaded. Triggered by', f.replace(process.cwd(), '.'))
  }

  /**
   * @property {Array} routes
   * A pointer to the raw Express routes.
   * @private
   */
  get routes() { // eslint-disable-line
    return this.app._router.stack
  }
}

global.NGNX = global.NGNX || {}
global.NGNX.http = global.NGN.http || {}
global.NGNX.http.Server = HttpServer
