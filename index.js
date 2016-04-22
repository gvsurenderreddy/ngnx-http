'use strict'

const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
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
 * @requires body-parser
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

    let me = this

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
       * @property {object} insertionpoint
       * The insertion point where route changes are reintroduced for each
       * user-defined module.
       * @private
       */
      insertionpoint: {
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
       * @property {Object} associations
       * A collection of the subfiles associated with a monitor.
       * @private
       */
      associations: {
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
      },

      /**
       * @cfg {boolean} [cors=false]
       * Use CORS support globally.
       */
      globalcors: {
        enumerable: false,
        writable: false,
        configurable: false,
        value: NGN.coalesce(cfg.cors, false)
      },

      /**
       * @cfg {boolean} [basiclog=true]
       * Use a simple built in log to view requests on the console.
       * The basic log outputs a timestamp, the request method, and the
       * request URL.
       */
      basiclog: {
        enumerable: false,
        writable: false,
        configurable: false,
        value: NGN.coalesce(cfg.basiclog, true)
      },

      /**
       * @cfg {boolean} [json=false]
       * Automatically parse JSON request bodies.
       */
      json: {
        enumerable: false,
        writable: false,
        configurable: false,
        value: NGN.coalesce(cfg.json, false)
      }
    })

    if (this.refresh) {
      console.warn('Automatic route refresh is enabled. This is only recommended for development environments.')
    }

    // Enable basic console logging.
    if (this.basiclog) {
      this.app.use(function (req, res, next) {
        console.log(new Date(), req.method, req.url)
        next()
      })
    }

    // Configure the x-powered-by header.
    if (this.poweredbyHeader) {
      this.app.use(function (req, res, next) {
        res.set('x-powered-by', me.poweredbyHeader)
        next()
      })
    } else {
      this.app.disable('x-powered-by')
    }

    // Configure Global CORS support.
    if (this.globalcors) {
      this.app.use(this.CORS)
      console.warn('Global CORS support activated.')
    }

    // Configure basic body parsing.
    bodyParser.urlencoded({ extended: false })
    if (this.json) {
      this.app.use(bodyParser.json())
    }

    /**
     * @method app.cors
     * A reference to the underlying CORS processor.
     * This is for use within routes.
     */
    this.app.cors = this.CORS

    /**
     * @property app.bodyparser
     * A reference to the underlying body-parser.
     * This is for use within routes.
     */
    this.app.bodyparser = bodyParser
  }

  /**
   * @property {function} CORSOPTIONS
   * The CORS options.
   * @private
   */
  get CORSOPTIONS() { // eslint-disable-line
    let me = this
    return function (req2, callback) {
      let opts = {}
      if (me.whitelist.length > 0) {
        opts.origin = (me.whitelist.indexOf(req2.header('origin')) !== -1)
      } else if (me.blacklist.length > 0) {
        opts.origin = (me.blacklist.indexOf(req2.header('origin')) === -1)
      } else {
        opts.origin = req2.headers.origin
      }
      if (me.allowedMethods.length > 0) {
        opts.methods = me.allowedMethods
      }
      if (me.allowedHeaders.length > 0) {
        opts.allowedHeaders = me.allowedHeaders
      }
      if (me.exposedHeaders.length > 0) {
        opts.exposedHeaders = me.exposedHeaders
      }
      if (me.credentials) {
        opts.credentials = me.credentials
      }
      if (me.maxAge !== null) {
        opts.maxAge = me.maxAge
      }
      // if (Object.keys(opts).length > 0) {
      //   opts.preflightContinue = true
      // }
      callback(null, opts)
    }
  }

  /**
   * @property {function} CORS
   * A reference to the underlying Express CORS engine.
   */
  get CORS() { // eslint-disable-line
    return cors(this.CORSOPTIONS)
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

  /**
   * @method getModules
   * Return the node modules that have been "required" in the app.
   * @private
   * @return {Array}
   * A list of the modules be reference.
   */
  get modules() { // eslint-disable-line
    // Get all of the required local modules (i.e. part of the project, not the core)
    return Object.keys(require.cache).filter(function (p) {
      return p.indexOf(process.cwd()) === 0 && p.indexOf('node_modules') < 0
    }).map(function (p) {
      return {
        path: path.resolve(path.join(process.cwd(), p.replace(__dirname, '').replace(process.cwd(), ''))),
        parent: require.cache[p].parent ? require.cache[p].parent.id : null
      }
    })
  }

  start() { // eslint-disable-line
    console.log('Starting up...')
    let me = this
    this._starting = true

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
      this.portnumber = 0
      this.server.listen(this.portnumber, this.ip, function () {
        me._running = true
        me._starting = false
        me.portnumber = me.server.address().port
        me.emit('start')
        console.info('Server running at', me.ip + ':' + me.portnumber)
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
   * @param {Array} postRange
   * The index range that should be moved to the end of the route list.
   * This is used internally and should never be used within an application.
   */
  createRoutes(mod, postRange) { // eslint-disable-line
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
        if (require.cache.hasOwnProperty(mod)) {
          delete require.cache[mod]
        }
        require(mod)(this.app)

        let me = this
        this.routes.forEach(function (r, i) {
          me.routes[i].index = i
        })
        this.routes.map(function (r, i) {
          if (r.name === 'bound dispatch' && !r.src) {
            r.src = mod
          }
          return r
        })
        if (postRange) {
          let move = this.routes.splice(postRange[0], (postRange[1] - postRange[0]) + 1)
          this.routes = this.routes.concat(move)
        }
        this.monitor(mod)
      }
    } else {
      mod(this.app)
    }
  }

  /**
   * @method reloadRoutes
   * Refresh the routes.
   * @private
   * @param  {string} filepath
   * The path to reload routes from.
   */
  reloadRoutes(f, trigger) { // eslint-disable-line
    // If auto-refresh isn't active, ignore this.
    if (!this.refresh) {
      return
    }

    let me = this
    let begin = null

    this.routes.forEach(function (r, i) {
      if (r.src && r.src === f) {
        begin = begin === null ? i : begin
        delete me.routes[i]
      }
    })

    this.routes = this.routes.filter(function (r) {
      return r !== undefined
    })

    let end = this.routes.length - 1

    // Clear any cached associations
    if (this.associations[f]) {
      this.associations[f].forEach(function (dependentFile) {
        if (require.cache.hasOwnProperty(dependentFile)) {
          delete require.cache[dependentFile]
        }
      })
    }

    begin = begin === null ? end : begin
    end = begin > end ? begin : end

    this.createRoutes(f, [begin, end])

    if (trigger) {
      console.info('Routes reloaded. Triggered by', trigger.replace(process.cwd(), '.'))
    } else {
      console.info('Routes reloaded. Triggered by', f.replace(process.cwd(), '.'))
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
   * @method monitor
   * Monitor a file for file changes. This enables route hot-reloading.
   * @private
   * @param  {string} filepath
   * The path of the file to monitor.
   * @param {string} [parent]
   * Identifies the parent monitor when appropriate
   */
  monitor(filepath, parent) { // eslint-disable-line
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
          let roots = me.getAssociatedRoots(f)
          if (roots.length === 0) {
            me.reloadRoutes(f)
          } else {
            roots.forEach(function (r) {
              me.reloadRoutes(r, f)
            })
          }
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

    this.deepmonitor(filepath)
  }

  deepmonitor(filepath) { // eslint-disable-line
    // If auto-refresh isn't active, ignore this.
    if (!this.refresh) {
      return
    }

    let me = this
    let dir = path.dirname(filepath)

    this.modules.forEach(function (m) {
      if (m.parent === filepath) {
        // If the monitor already exists, modify the files
        if (me.monitors.hasOwnProperty(path.dirname(m.path))) {
          if (me.monitors[dir].files.indexOf(m.path) < 0) {
            console.log('Watching', m.path)
            me.monitors[dir].files.push(m.path)
            me.associateWith(m.path, m.parent)
            me.deepmonitor(m.path)
          }
        } else {
          me.monitor(m.path, dir)
        }
      }
    })
  }

  associateWith(src, parent) { // eslint-disable-line
    let me = this
    let processed = false
    Object.keys(this.associations).forEach(function (a) {
      if (me.associations[a].indexOf(parent) >= 0) {
        if (me.associations[a].indexOf(src) < 0) {
          me.associations[a].push(src)
          processed = true
        }
      }
    })
    if (!processed) {
      this.associations[parent] = this.associations[parent] || []
      this.associations[parent].push(src)
    }
  }

  getAssociatedRoots(filepath) { // eslint-disable-line
    let me = this
    let root = Object.keys(this.associations).filter(function (a) {
      return me.associations[a].indexOf(filepath) >= 0
    })
    return root
  }

  /**
   * @property {Array} routes
   * A pointer to the raw Express routes.
   * @readonly
   * @private
   */
  get routes() { // eslint-disable-line
    return this.app._router.stack
  }
  // Explicitly hidden
  set routes(value) { // eslint-disable-line
    this.app._router.stack = value
  }
}

global.NGNX = global.NGNX || {}
global.NGNX.http = global.NGN.http || {}
global.NGNX.http.Server = HttpServer
