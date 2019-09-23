'use strict';

/**
 * Module dependencies.
 */
var mongoose  = require('mongoose'),
    Schema    = mongoose.Schema,
    crypto    = require('crypto'),
          _   = require('lodash');

/**
 * Getter
 */
var escapeProperty = function(value) {
  return _.escape(value);
};

/**
 * Post Schema
 */

var GallerySchema = new Schema({
  created: {
    type: Date,
    default: Date.now
  },
  creator: {
    type: Schema.ObjectId,
    required: true,
    ref: 'User'
  },
  filename: {
    type: String,
    required: true,
    get: escapeProperty,
    match: [/^[a-zA-Z0-9_]*$/, 'Oh no! Only numbers and letters for stream names.']
  },
  url: {
    type: String,
    required: true,
    get: escapeProperty
  },
  post: {
    type: Schema.ObjectId,
    required: false,
    ref: 'Post'
  },
  stream: {
    type: Schema.ObjectId,
    required: false,
    ref: 'Stream'
  },
});

/**
 * Methods
 */
GallerySchema.methods = {
  /**
   * Hide security sensitive fields
   * 
   * @returns {*|Array|Binary|Object}
   */
  toJSON: function() {
    var obj = this.toObject();
    if (obj.creator) {
      delete obj.creator.token;
      delete obj.creator.hashed_password;
      delete obj.creator.salt;
      delete obj.creator.following;
    }
    if (obj.likes) {
      obj.likeCount = obj.likes.length;
    } else {
      obj.likeCount = 0;
    }
    return obj;
  },
  subscribe: function(userId) {
    if (this.subscribers.indexOf(userId) === -1 && this._id !== userId) { //cannot subscribe to own post
      this.subscribers.push(userId);
    }
  },
  notifyUsers: function(data, System) {
    
    var notification = {
      postId: data.postId,
      actorId: data.actorId,
      notificationType: data.type
    };
    this.populate('creator subscribers', function(err, gallery) {
      gallery.subscribers.map(function(user) {
        /**
         * Ignore creator, because we have a special call for that later
         */
        if (user._id.toString() === gallery.creator._id.toString()) {
          return;
        }
        /**
         * Ignore the person taking this action
         */
        if (user._id.toString() === data.actorId.toString()) {
          return;
        }
        /**
         * Notify
         */
        user.notify(notification, System);
      });

      /**
       * Notify creator, if its not the creator taking this action
       */
      if (gallery.creator._id.toString() !== data.actorId.toString()) {
        gallery.creator.notify(notification, System);
      }
    });
  }
};

mongoose.model('Gallery', GallerySchema);
