var util = require('util');

/**
 * The redis error constructor
 * Thrown when there is a redis error
 *
 * @constructor
 * @extends Error
 *
 * @param {string} message The message to assign the error
 */
function RedisError(message) {
  Error.captureStackTrace(this, RedisError);
  this.name = 'RedisError';
  this.message = message;
}

/**
 * The acquisition error constructor
 * Thrown when unable to obtain a lock
 *
 * @constructor
 * @extends Error
 *
 * @param {string} message The message to assign the error
 */
function AcquireError(message) {
  Error.captureStackTrace(this, AcquireError);
  this.name = 'AcquireError';
  this.message = message;
}

/**
 * The lock error constructor
 * Thrown when the lock times out
 *
 * @constructor
 * @extends Error
 *
 * @param {string} message The message to assign the error
 */
function LockError(message) {
  Error.captureStackTrace(this, LockError);
  this.name = 'LockError';
  this.message = message;
}

util.inherits(RedisError, Error);
util.inherits(AcquireError, Error);
util.inherits(LockError, Error);

exports.RedisError = RedisError;
exports.AcquireError = AcquireError;
exports.LockError = LockError;