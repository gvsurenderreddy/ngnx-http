'use strict'

const EventEmitter = require('events').EventEmitter
const express = require('express')
const path = require('path')
const watch = require('watch')

/**
 * @class NGN.HttpServer
 * The NGN HTTP server is an express-based server designed to
 * @requires express
 */
class HttpServer extends NGN.Server {
  constructor (cfg) {
    cfg = cfg || {}
    super()

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
        value:  cfg.CORS || cfg.cors || null
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
				enumerable:	false,
				writable:	true
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
        value: cfg.poweredby
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
  get CORS () {
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
  get CORSDOMAINS () {
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
  get allowedMethods () {
    if (this._ALLOWMETHODS == null){
      return ['GET','HEAD','POST','PUT','DELETE','TRACE','OPTIONS','CONNECT','PATCH']
    } else {
      return this._ALLOWMETHODS.toString().toUpperCase().split(',')
    }
  }

  set allowedMethods (value) {
    this._ALLOWMETHODS = (Array.isArray(value) == true ? value.join() : value).toUpperCase()
  }

  get ca () {
    if (NGN.util.pathReadable(this.certauthority)) {
      this.certauthority = fs.readFileSync(this.certauthority)
    }
    return this.certauthority
  }

  get certificate () {
    if (NGN.util.pathReadable(this.crt)) {
      this.crt = fs.readFileSync(this.crt)
    }
    return this.crt
  }

  get key () {
    if (NGN.util.pathReadable(this.privkey)) {
      this.privkey = fs.readFileSync(this.privkey)
    }
    return this.privkey
  }

  get passphrase () {
    if (NGN.util.pathReadable(this.keypass)) {
      this.keypass = fs.readFileSync(this.keypass)
    }
    return this.keypass
  }

  get poweredbyHeader () {
    return this.poweredby || 'NGN'
  }

  start () {

  }

  stop () {

  }

  fileFilter (dir) {
    let me = this
    return function (filepath) {
      if (!me.monitors.hasOwnProperty(dir)) {
        return false
      }
      if (!me.monitors[dir].hasOwnProperty('files')) {
        return false
      }
      return me.monitors[dir].files.indexOf(path.basename(filepath)) >= 0
    }
  }

  monitor () {
    // If auto-refresh isn't active, ignore this.
    if (!this.refresh) {
      return
    }

    // Get all of the required local modules (i.e. part of the project, not the core)
    let modules = Object.keys(require.cache).filter(function (p) {
      return p.indexOf(process.cwd()) === 0 && p.indexOf('node_modules') < 0
    }).map(function (p) {
      return path.resolve(path.join(process.cwd(), p.replace(__dirname, '').replace(process.cwd(), '')))
    })

    let me = this
    modules.forEach(function (filepath) {
      let dir = path.dirname(filepath)
      if (!me.monitors.hasOwnProperty(dir)) {
        watch.createMonitor(dir, {
          ignoreDotFiles: true,
          filter: me.fileFilter(dir),
          ignoreUnreadableDir: true,
          ignoreNotPermitted: true,
          ignoreDirectoryPattern: '/node_modules/'
        }, function (m) {
          m.on('created', me.reloadRoutes)
          m.on('changed', function (f) {
            me.reloadRoutes(f)
          })
          m.on('removed', me.reloadRoutes)
          me.monitors[dir] = {
            monitor: m,
            files: [path.basename(filepath)]
          }
        })
      } else {
        if (me.monitors[dir].files.indexOf(path.basename(filepath)) < 0) {
          me.monitors[dir].files.push(path.basename(filepath))
        }
      }
      console.warn('Watching', filepath)
    })
  }

  reloadRoutes (f) {
    // If auto-refresh isn't active, ignore this.
    if (!this.refresh) {
      return
    }
    console.info('Reloading routes. Triggered by:', f)
  }
}

global.NGN.http = global.NGN.http || {}
global.NGN.http.Server = HttpServer
