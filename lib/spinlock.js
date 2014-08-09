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
  var opts = options || {};

  /**
   * Default Options
   * @type {Mixed}
   */
  var client = opts.client
    , host = opts.host || '127.0.0.1'
    , port = opts.port || 6379
    , timeout = opts.timeout || 500
    , retry = opts.retry || 100
    , retries = opts.retries || Infinity
    , keepalive = opts.keepalive || 100
    , keepalives = opts.keepalives || Infinity;

  /**
   * Acquire a Spinlock
   *
   * @param  {String}   name    The name of the spinlock
   * @param  {Function} cb      Callback handler
   * @return {Promise}          Return a promise object
   */
  function acquire(name, cb) {
    return when.promise(function(resolve, reject) {
      var requests = 0
        , refreshes = 0
        , interval = null
        , value = 'someval';

      /**
       * Request a Redis Lock
       */
      function request() {
        client.set([name, value, "PX", timeout, "NX"],
          function(err, res) {
            if (err) {
              next(new RedisError(err));
            }
            else if (res === 'OK') {
              next(refresh, keepalive);
              cb(release);
            }
            else if (requests++ >= retries) {
              next(new AcquireError('Unable to acquire the lock'));
            }
            else if (!interval) {
              next(request, retry);
            }
        });
      }

      /**
       * Keep the Redis Lock Alive
       */
      function refresh() {
        client.set([name, value, "PX", timeout],
          function(err) {
            if (err) {
              next(new RedisError(err));
            }
            else if (refreshes++ >= keepalives) {
              next(new LockError('Lock keepalive timeout'));
            }
        });
      }

      /**
       * Release the Redis Lock
       *
       * @param  {[type]} err  Release Error
       * @param  {[type]} data Release Data
       */
      function release(err, data) {
        next(null, client.del(name,
          function(error) {
            if (error) {
              reject(new RedisError(error));
            }
            else if (err) {
              reject(err);
            }
            else {
              resolve(data);
            }
        }));
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

      /**
       * Start the Request Polling
       */
      if (!client) {
        client = redis.createClient(port, host);
      }
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
