var _      = require('lodash');
var redis  = require('redis');
var when   = require('when');
var errors = require('./errors');

/**
 * Error Constructors
 * @type {Error}
 */
var RedisError = errors.RedisError;
var AcquireError = errors.AcquireError;
var LockError = errors.LockError;

/**
 * Spinlock Constructor
 *
 * @param  {object} options    Configuration options
 * @return {object}            Lock
 */
module.exports = function(options) {
  options = _.extend({

    // The redis http port
    port: 6379,

    // Thr redis hostname
    host: '127.0.0.1',

    // The number of milliseconds for redis to timeout the lock
    timeout: 500,

    // The number of milliseconds between acquire pings
    attempt: 100,

    // The number of times to ping to acquire lock
    attempts: Infinity,

    // The number of milliseconds between keepalive pings
    keepalive: 100,

    // The number of times to ping with keepalives
    keepalives: Infinity,

    // Whether to force the lock to clear when acquire ends
    autorelease: true

  }, options);

  /**
   * Initialize the Redis Client
   */
  var client = options.client
    || redis.createClient(options.port, options.host);

  /**
   * Acquire a Spinlock
   *
   * @param  {String}   name    The name of the spinlock
   * @param  {Function} cb      Callback handler
   * @return {Promise}          Return a promise object
   */
  function acquire(name, cb) {
    var opts = options;

    // --- If name is an options object ---
    if (typeof name === 'object') {
      opts = _.extend({}, name, options);
      name = opts.name;
    }

    // --- Return promise ---
    return when.promise(function(resolve, reject) {
      var requests = 0
        , refreshes = 0
        , interval = null
        , released = 0
        , value = 'someval'; // <<< do something here ???

      // --- Errpr checking ---
      if (!client) {
        reject(new RedisError('Unable to connect to redis'));
      }
      else if (typeof name !== 'string') {
        reject(new TypeError('Acquire name is not a string'));
      }
      else if (typeof cb !== 'function') {
        reject(new TypeError('Acquire callback is not a function'));
      }
      else {
        request();
      }

      /**
       * Request a Redis Lock
       * - Polling function
       */
      function request() {
        if (requests++ >= opts.attempts) {
          return next(new AcquireError('Max attempts reached'));
        }

        client.set([name, value, "PX", opts.timeout, "NX"],
          function(err, res) {
            if (err) {
              next(new RedisError(err));
            }
            else if (res === 'OK') {
              next(refresh, opts.keepalive);

              try {
                when(cb(release)).then(function(data) {
                  release(null, data);
                }, release);
              }
              catch(err) {
                release(err);
              }
            }
            else if (!interval) {
              next(request, opts.attempt);
            }
        });
      }

      /**
       * Keep the Redis Lock Alive
       * - Polling function
       */
      function refresh() {
        if (refreshes++ >= opts.keepalives) {
          return next(new LockError('Lock keepalive timeout'));
        }

        client.set([name, value, "PX", opts.timeout],
          function(err) {
            if (err) {
              next(new RedisError(err));
            }
        });
      }

      /**
       * Release the Redis Lock
       * - Callback function
       *
       * @param  {[type]} err  Release Error
       * @param  {[type]} data Release Data
       */
      function release(err, data) {
        if (!(released++)) {
          next();

          if (opts.autorelease) {
            client.del(name, function(error) {
              if (error) {
                reject(new RedisError(error));
              }
              else if (err) {
                reject(err);
              }
              else {
                resolve(data);
              }
            });
          }
          else if (err) {
            reject(err);
          }
          else {
            resolve(data);
          }
        }
      }

      /**
       * Next Time Interval
       *
       * @param  {String|Function}   handler
       * @param  {Number}            time
       */
      function next(handler, time) {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        if (handler && time) {
          interval = setInterval(handler, time);
        }
        else if (handler) {
          reject(handler);
        }
      }

    });
  }

  /**
   * Return the Spinlock Object
   */
  return {
    acquire: acquire,
    RedisError: RedisError,
    AcquireError: AcquireError,
    LockError: LockError
  };

};
