'use strict'

const express = require('express')
const path = require('path')
const fs = require('fs')
const watch = require('watch')

/**
 * @class NGN.HttpServer
 * The NGN HTTP server is an express-based server designed to
 * @requires express
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
       * @cfg {number} [port=80/443]
       * The port on which the server is listening.
       * By default, this is `80`, or `443` if a TLS certifcate is specified.
       */
      port: {
        enumerable: true,
        configurable: false,
        writable: false,
        value: cfg.port || (cfg.certificate ? 443 : 80)
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
       * @cfg {Boolean/String/Array} [allowCrossOrigin=false]
       * Set to `true` to enable requests from all origins. Alternatively,
       * provide a {String} domain, such as `http://my.safedomain.com` or `https://my.safedomain.com, https://other.domain.net`.
       * Also accepts an array of domains:
       * `['https://first.safedomain.com','https://second.safedomain.com']`
       */
      corscfg: {
        enumerable: false,
        configurable: false,
        writable: true,
        value: cfg.CORS || cfg.cors || null
      },

      /**
       * @cfg {Boolean} [allowCrossOriginCookies=false]
       * By default, cookies are not included in CORS requests. Use this header to indicate that cookies should be included in CORS requests.
       */
      _ALLOWCORSCREDENTIALS: {
        value: NGN.coalesce(cfg.allowCrossOriginCookies, false),
        enumerable: false,
        writable: false,
        configurable: false
      },

      _ALLOWMETHODS: {
        value: cfg.allowedMethods || null,
        enumerable: false,
        writable: true
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
      }
    })

    if (this.refresh) {
      console.warn('Automatic route refresh is enabled. This is only recommended for development environments.')
    }
  }

  /**
   * @property {boolean} CORS
   * Indicates CORS support has been activated.
   */
  get CORS() { // eslint-disable-line
    switch (typeof this.corscfg) {
      case 'boolean':
        return this.corscfg
      case 'string':
        return true
      default:
        return Array.isArray(this.corscfg)
    }
  }

  /**
   * @property {Array} CORSDOMAINS
   * A reference to the accepted CORS domains.
   * @private
   */
  get CORSDOMAINS() { // eslint-disable-line
    return this.CORS ? (
      Array.isArray(this.corscfg) ? this.corscfg : (
        typeof this.corscfg === 'boolean' ? ['*'] : this.corscfg.split(',')
        )
      ) : []
  }

  /**
   * @property {Array} allowedMethods
   * An array of the HTTP methods allowed by the server. By default,
   * all methods are allowed. Methods may be restricted explicitly
   * setting the #allowedMethods configuration parameter.
   */
  /**
   * @cfg {String/Array}
   * Restrict traffic to specific HTTP methods/verbs such as `GET`,`POST`,`PUT`, and `DELETE`.
   * By default, everything is allowed. Only configure this when the application needs to explicitly
   * use a limited number of verbs. For example, a read-only site may set this to `GET`.
   */
  get allowedMethods() { // eslint-disable-line
    if (this._ALLOWMETHODS == null) {
      return ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'TRACE', 'OPTIONS', 'CONNECT', 'PATCH']
    } else {
      return this._ALLOWMETHODS.toString().toUpperCase().split(',')
    }
  }

  set allowedMethods(value) { // eslint-disable-line
    this._ALLOWMETHODS = (Array.isArray(value) === true ? value.join() : value).toUpperCase()
  }

  get ca() { // eslint-disable-line
    if (NGN.util.pathReadable(this.certauthority)) {
      this.certauthority = fs.readFileSync(this.certauthority)
    }
    return this.certauthority
  }

  get certificate() { // eslint-disable-line
    if (NGN.util.pathReadable(this.crt)) {
      this.crt = fs.readFileSync(this.crt)
    }
    return this.crt
  }

  get key() { // eslint-disable-line
    if (NGN.util.pathReadable(this.privkey)) {
      this.privkey = fs.readFileSync(this.privkey)
    }
    return this.privkey
  }

  get passphrase() { // eslint-disable-line
    if (NGN.util.pathReadable(this.keypass)) {
      this.keypass = fs.readFileSync(this.keypass)
    }
    return this.keypass
  }

  get poweredbyHeader() { // eslint-disable-line
    return this.poweredby || 'NGN'
  }

  start() { // eslint-disable-line
    this._starting = true
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

    let me = this
    this.server.listen(this.port, this.ip, function () {
      me._running = true
      me._starting = false
      me.emit('start')
      console.log('Server running at', me.ip + ':' + me.port)
    })
  }

  stop() { // eslint-disable-line
    let me = this
    this.server.on('stop', function () {
      this._running = false
      me.emit('stop')
    })
    this.server.stop()
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

  getModules() { // eslint-disable-line
    // Get all of the required local modules (i.e. part of the project, not the core)
    return Object.keys(require.cache).filter(function (p) {
      return p.indexOf(process.cwd()) === 0 && p.indexOf('node_modules') < 0
    }).map(function (p) {
      return path.resolve(path.join(process.cwd(), p.replace(__dirname, '').replace(process.cwd(), '')))
    })
  }

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

  reindexRoutes(start, end) { // eslint-disable-line
    let me = this
    Object.keys(this.managedroutes).forEach(function (filepath) {
      if (me.managedroutes[filepath][0] > end) {
        me.managedroutes[filepath][0] = me.managedroutes[filepath][0] - start
        me.managedroutes[filepath][1] = me.managedroutes[filepath][1] - end
      }
    })
  }

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

  get routes() { // eslint-disable-line
    return this.app._router.stack
  }
}

global.NGNX = global.NGNX || {}
global.NGNX.http = global.NGN.http || {}
global.NGNX.http.Server = HttpServer
