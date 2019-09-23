var mongoose = require('mongoose');
var Post = mongoose.model('Post');
var gallery = require("../../../galleries/server/models/gallery");
var Gallery = mongoose.model("Gallery");
var fs = require('fs');

module.exports = function(System) {
  var obj = {};
  var json = System.plugins.JSON;
  var event = System.plugins.event;
  var sck = System.webSocket;

  /**
   * Event based notifications
   */
  ['like', 'comment', 'unlike'].map(function(action) {
    event.on(action, function(data) {
      var post = data.post;
      var actor = data.actor;
      post.notifyUsers({
        postId: post._id,
        actorId: actor._id,
        type: action,
        config: {
          systemLevel: (action === 'unlike'),
          avoidEmail: (action === 'unlike')
        }
      }, System);
    });
  });

  /**
   * Create a new post
   * @param  {Object} req Request
   * @param  {Object} res Response
   * @return {Void}
   */
  obj.create = function(req, res) {
    var post = new Post(JSON.parse(req.body.data));
    if(req.files.length > 0){
      var gallery = obj.upload(req, res);
      post.attachments.push(gallery._id);
      //post.attachments[0].url = 'uploads/' + gallery.filepath;
    }
    post.creator = req.user._id;
    post.save(function(err) {
      post = post.afterSave(req.user);

      /**
       * Notify mentioned users
       */
      post.getMentionedUsers(function(err, users) {
        users.map(function(user) {
          /**
           * Notify the mentioned users
           */
          user.notify({
            actorId: req.user._id,
            postId: post._id,
            notificationType: 'mention'
          }, System);

          /**
           * Subscribe the mentioned users for future notifications
           */
          post.subscribe(user._id);
          post.save();

        });
      });
      event.trigger('newpost', {post: post, actor: req.user});

      /**
       * Notify all followers about this new post
       * @type {Void}
       */
      req.user.notifyFollowers({
        postId: post._id,
        streamId: post.stream ? post.stream : false,
        notificationType: 'feed',
        config: {
          avoidEmail: true,
          systemLevel: true
        }
      }, System);

      if (err) {
        return json.unhappy(err, res);
      }
      return json.happy(post, res);
    });
  };

  obj.delete = function(req, res) {
    Post.findOne({ _id: req.params.postId })
    .populate('creator')
    .exec(function(err, post) {
      if(req.user.id == post.creator.id || req.user.designation == "Admin"){ 
        Post.findByIdAndRemove(req.params.postId, (err, post) => {  
          if (err) return json.unhappy(err, res);
          var attachments = post.attachments;
          var streamId = post.stream;
          for (var i = 0; i < attachments.length; i++) {
            Gallery.findByIdAndRemove(attachments[i], (err, gallery) => {  
              if (err) {
                return json.unhappy(err, res);
              }
              if(gallery.url !== "" && gallery.url !== undefined){
                try{
                  stream_id = gallery.stream? gallery.stream.id: 0;
                  obj.deleteImgFromPHPServer(gallery.id, stream_id);
                  if(gallery.url.indexOf("http://") == -1){
                    fs.unlinkSync("./public/"+gallery.url);
                  }
                }catch(ex){
                  console.log("File not exist with exception", ex);
                }
              }
            });
          }
          return json.happy({message: 'Post deleted successfuly'}, res);
        });
      }else{
        err = err? err : {};
        err.message = "You don't have permission to perform this action" 
        return json.unhappy(err, res);
      }
    });
  }

  /**
   * Create a new comment
   * @param  {Object} req Request
   * @param  {Object} res Response
   * @return {Void}
   */
  obj.comment = function(req, res) {
    var postId = req.params.postId;
    Post.findOne({ _id: postId })
    .populate('creator')
    .populate('comments')
    .populate('stream')
    .populate('comments.creator')
    .exec(function(err, post) {
      post.comments.push({
        creator: req.user,
        content: req.body.comment
      });
      post.comments.sort(function(a, b) {
        var dt1 = new Date(a.created);
        var dt2 = new Date(b.created);
        if (dt1 > dt2) {
          return -1;
        } else {
          return 1;
        }
      });
      post.subscribe(req.user._id);
      post.save(function(err) {
        post = post.afterSave(req.user, req.query.limitComments);
        event.trigger('comment', {post: post, actor: req.user});
        if (err) {
          return json.unhappy(err, res);
        }
        return json.happy({
          record: post
        }, res);
      });
    });
  };

  /**
   * Get posts written by the current user
   * @param  {Object} req The request object
   * @param  {Object} res The response object
   * @return {Void}
   */
  obj.timeline = function(req, res) {

    var userId = req.params.userId || req.user._id;
    
    /**
     * This function is called after resolving username to user's _id
     * @return {Void}
     */
    var getPosts = function() {
      var criteria = { creator: userId };
      console.log(criteria);
      if (req.query && req.query.timestamp) {
        criteria.created = { $gte: req.query.timestamp };
      }
      if (req.query && req.query.filter) {
        delete criteria.created;
        criteria.content = new RegExp(req.query.filter, 'i');
      }
      Post.find(criteria, null, {sort: {created: -1}})
      .populate('creator')
      .populate('comments')
      .populate('stream')
      .populate('attachments')
      .populate('comments.creator')
      .skip(parseInt(req.query.page) * System.config.settings.perPage)
      .limit(System.config.settings.perPage+1)
      .exec(function(err, posts) {
        if (err) {
          json.unhappy(err, res);
        } else {
          var morePages = System.config.settings.perPage < posts.length;
          if (morePages) {
            posts.pop();
          }
          posts.map(function(e) {
            e = e.afterSave(req.user, req.query.limitComments);
          });
          json.happy({
            records: posts,
            morePages: morePages
          }, res);
        }
      });
    };

    /**
     * If provided with username instead of _id, get the _id
     */
    var User = mongoose.model('User');

    User.findOne({username: userId}).exec(function(err, user) {
      if (err) throw err;
      /**
       * If user is not found by username, continue using the invalid ID
       */
      if (user) {
        userId = user._id;
      }
      return getPosts();
    });
  };

  /**
   * Get posts of a particular stream
   * @param  {Object} req The request object
   * @param  {Object} res The response object
   * @return {Void}
   */
  obj.streamPosts = function(req, res) {

    var streamId = req.params.streamId;
    
    /**
     * This function is called after resolving username to user's _id
     * @return {Void}
     */
    var getPosts = function() {
      var criteria = { stream: streamId };
      if (req.query && req.query.timestamp) {
        criteria.created = { $gte: req.query.timestamp };
      }
      if (req.query && req.query.filter) {
        delete criteria.created;
        criteria.content = new RegExp(req.query.filter, 'i');
      }
      Post.find(criteria, null, {sort: {created: -1}})
      .populate('creator')
      .populate('stream')
      .populate('comments')
      .populate('attachments')
      .populate('comments.creator')
      .skip(parseInt(req.query.page) * System.config.settings.perPage)
      .limit(System.config.settings.perPage+1)
      .exec(function(err, posts) {
        if (err) {
          json.unhappy(err, res);
        } else {
          var morePages = System.config.settings.perPage < posts.length;
          if (morePages) {
            posts.pop();
          }
          posts.map(function(e) {
            e = e.afterSave(req.user, req.query.limitComments);
          });
          json.happy({
            records: posts,
            morePages: morePages
          }, res);
        }
      });
    };

    return getPosts();
  };

  /**
   * Get posts from users being followed
   * @param  {Object} req The request object
   * @param  {Object} res The response object
   * @return {Void}
   */
  obj.feed = function(req, res) {
    //TODO: pagination
    var user = req.user;
    var criteria = { 
      $or:[{
        creator: { $in: user.following.concat(user._id) }
      },
      {
        stream: { $in: user.streams },
      }]
    };
    if (req.query && req.query.timestamp) {
      criteria.created = { $gte: req.query.timestamp };
    }
    if (req.query && req.query.filter) {
      delete criteria.created;
      criteria.content = new RegExp(req.query.filter, 'i');
    }
    //all users feed -temporary
    delete criteria.$or;
    Post.find(criteria, null, {sort: {created: -1}})
    .populate('creator')
    .populate('comments')
    .populate('stream')
    .populate('attachments')
    .populate('comments.creator')
    .skip(parseInt(req.query.page) * System.config.settings.perPage)
    .limit(System.config.settings.perPage+1)
    .exec(function(err, posts) {
      if (err) {
        json.unhappy(err, res);
      } else {
        var morePages = System.config.settings.perPage < posts.length;
        if (morePages) {
          posts.pop();
        }
        posts.map(function(e) {
          e = e.afterSave(req.user, req.query.limitComments);
        });
        json.happy({
          records: posts,
          morePages: morePages
        }, res);
      }
    });
  };

  /**
   * Get a single post
   * @param  {Object} req Request
   * @param  {Object} res Response
   * @return {Void}
   */
  obj.single = function(req, res) {
    Post.findOne({
      _id: req.params.postId
    })
    .populate('creator')
    .populate('attachments')
    .populate('comments')
    .populate('comments.creator')
    .populate('stream')
    .exec(function(err, post) {
      if (err) {
        return json.unhappy(err, res);
      } else if (post) {
        post = post.afterSave(req.user, req.query.limitComments);

        /**
         * Mark all notifications as read, for the current user, for this single post
         */
        if (req.query.allowMarking && req.user) {
          var userModified = false;
          req.user.notifications.map(function(notification) {
            /**
             * Mark unread only those that are related to a post, not a user
             */
            if (!notification.post) return;

            if (notification.post.toString() === post._id.toString()) {
              notification.unread = false;
              userModified = true;
            }
          });

          if (userModified) {
            req.user.save(function(err, user) {
              console.log('Marked as read.');
              if (req.user.socketId) {
                sck.to(req.user.socketId).emit('notification');
              }
            });
          }
        }
        
        return json.happy({
          record: post
        }, res);
      } else {
        return json.unhappy({message: 'Post not found'}, res);
      }
    });
  };

  /**
   * Like a post
   * @param  {Object} req Request
   * @param  {Object} res Response
   * @return {Void}
   */
  obj.like = function(req, res) {
    Post.findOne({_id: req.params.postId})
    .populate('creator')
    .populate('comments')
    .populate('stream')
    .populate('comments.creator')
    .exec(function(err, post) {
      if (err) {
        return json.unhappy(err, res);
      } else if (post) {
        if (post.likes.indexOf(req.user._id) !== -1) {
          return json.unhappy('You have already liked the post', res);
        }
        post.likes.push(req.user._id);
        post.subscribe(req.user._id);
        post.save(function(err, item) {
          post = post.afterSave(req.user, req.query.limitComments);
          event.trigger('like', {post: post, actor: req.user});
          if (err) {
            return json.unhappy(err, res);
          }
          json.happy({
            record: item
          }, res);
        });
        
      } else {
        return json.unhappy({message: 'Post not found'}, res);
      }
    });
  };

  /**
   * Get likes on a post
   * @param  {Object} req Request
   * @param  {Object} res Response
   * @return {Void}
   */
  obj.likes = function(req, res) {
    Post.findOne({_id: req.params.postId})
    .populate('likes')
    .exec(function(err, post) {
      if (err) {
        return json.unhappy(err, res);
      } else if (post) {
        json.happy({
          records: post.likes
        }, res);
        
      } else {
        return json.unhappy({message: 'Post not found'}, res);
      }
    });
  };

  /**
   * unLike a post
   * @param  {Object} req Request
   * @param  {Object} res Response
   * @return {Void}
   */
  obj.unlike = function(req, res) {
    Post.findOne({_id: req.params.postId})
    .populate('creator')
    .populate('comments')
    .populate('stream')
    .populate('comments.creator')
    .exec(function(err, post) {
      if (err) {
        return json.unhappy(err, res);
      } else if (post) {
        if (post.likes.indexOf(req.user._id) !== -1) {
          post.likes.splice(post.likes.indexOf(req.user._id), 1);
          post.save(function(err, item) {
            post = post.afterSave(req.user, req.query.limitComments);
            event.trigger('unlike', {post: post, actor: req.user});
            if (err) {
              return json.unhappy(err, res);
            }
            return json.happy({
              record: item
            }, res);
          });
        } else {
          return json.unhappy('You have not yet liked the post', res);
        }
        
      } else {
        return json.unhappy({message: 'Post not found'}, res);
      }
    });
  };

  /**
   * Upload attachment and return imgURL
   * @param  {Object} req Request
   * @param  {Object} res Response
   * @return {String} image_url      
   */
  obj.upload = function(req, res) {
    var gallery = new Gallery();
    var reqBody = JSON.parse(req.body.data);
    var streamId = reqBody.stream;
    var user = req.user;
    var file = req.files[0];
    var file_extension = file.mimetype.replace('image/','');
    /**
     * Check extension
     */
    if (['png', 'jpg', 'jpeg', 'gif'].indexOf(file_extension) === -1) {
      return json.unhappy({message: 'Only images allowed.'}, res);
    }

    /**
     * Get file name
     * @type {String}
     */
    var filename = file.path.substr(file.path.lastIndexOf('/')+1);
    var filepath = filename;
    if(streamId && streamId !== ""){
      /*
      filepath = streamId+"/"+filename;
      var oldpath = "./public/uploads/"+filename;
      var newpath = "./public/uploads/"+streamId+"/"+filename;
      move(oldpath, newpath, function(err){
        if(err){
          return json.unhappy({message: 'Error in moving file.'}, res);
        }
      });
      file.path = newpath;
      */
      gallery.stream = streamId;
    }
    if(System.config.IMG_STATIC !== ""){
      obj.sendToPHPServer(file, gallery.id, streamId);
    }
    var AWS = require('aws-sdk');
    
    /**
     * Config params stored in the environment
     * @type {String}
     */
    AWS.config.accessKeyId = System.config.aws.accessKeyId;
    AWS.config.secretAccessKey = System.config.aws.secretAccessKey;

    /**
     * Set bucket and other params
     * @type {Object}
     */
    var params = {
      Bucket: 'atwork', 
      Key: filename,
      Body: fs.readFileSync(file.path),
      ContentType: 'application/image',
      ACL: 'public-read'
    };

    if(AWS.config.accessKeyId !== undefined){
      var s3 = new AWS.S3();

      /**
       * Upload to s3
       */
      s3.putObject(params, function(error, data) {
        if (error) {
          throw error;
        }
      });

      /**
       * Update the user with the s3 path, even if its not yet uploaded
       * @type {String}
       */
      gallery.url = 'https://s3.amazonaws.com/atwork/' + filepath;
    }else{

      /**
       * Update the user with the system path, even if its not yet uploaded
       * @type {String}
       */
      try{
        if(gallery.url !== "" && gallery.url !== undefined){
          fs.unlinkSync("./public/"+gallery.url);
        } 
      }catch(e){
          console.log("Error",e);
      }
      if(System.config.IMG_STATIC !== ""){
        gallery.url = System.config.IMG_STATIC_URL+'?image_id=' + gallery.id;
      }else{
        gallery.url = "uploads/"+filepath;
      }
    }

    gallery.creator = user;
    gallery.filename = filename;
    gallery.save();
    /**
     * Return a locally uploaded file for faster response
     * @type {String}
     */
    return gallery;

  };
  function move(oldPath, newPath, callback) {

    fs.rename(oldPath, newPath, function (err) {
        if (err) {
            if (err.code === 'EXDEV') {
                copy();
            } else {
                callback(err);
            }
            return;
        }
        callback();
    });

    function copy() {
        var readStream = fs.createReadStream(oldPath);
        var writeStream = fs.createWriteStream(newPath);

        readStream.on('error', callback);
        writeStream.on('error', callback);

        readStream.on('close', function () {
            fs.unlink(oldPath, callback);
        });

        readStream.pipe(writeStream);
    }
  }

  obj.sendToPHPServer = function(file, image_id, stream_id){
    var request = require('request');
    if(!stream_id){
      stream_id = 0;
    }
    var formData = {
      image: {
        value: fs.createReadStream(file.path),
        options: {
          filename: file.originalname,
          contentType: file.mimeType
        }
      },
      'image_id': image_id,
      'stream_id': stream_id,
    };
    var uploadOptions = {
        "url": System.config.IMG_STATIC+"/upload.php",
        "method": "POST",
        "headers": {
            //"Authorization": "Bearer " + accessToken
        },
        "formData": formData
    }
    var req = request(uploadOptions, function(err, resp, body) {
        try{
          body = JSON.parse(body);
        }catch(ex){
          console.log('Not a JSON string ', ex);
        }
        if (err) {
            console.log('Error ', err);
            return err;
        } else {
            console.log('upload successful', JSON.stringify(body));
            return body;
        }
    });
  };

  obj.deleteImgFromPHPServer= function(image_id, stream_id){
    var request = require('request');
    if(!stream_id){
      stream_id = 0;
    }
    var params = {
      "image_id": image_id,
      "stream_id": stream_id,
    }
    var options = {
        "url": System.config.IMG_STATIC+"/delete.php",
        "method": "POST",
        "headers": {
            //"Authorization": "Bearer " + accessToken
        },
        "formData": params,
    }
    var req = request(options, function(err, resp, body) {
        try{
          body = JSON.parse(body);
        }catch(ex){
          console.log(ex);
          return "Unable to communicate image server: JOSN Body parse error";
        }
        if (err) {
            console.log('Error ', err);
            return err;
        } else {
            console.log('deleted successful', JSON.stringify(body));
            return body;
        }
    });
  };

  return obj;
};