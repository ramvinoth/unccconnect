'use strict';

angular.module('atwork.posts')
  .factory('appPosts', ['$resource',
    function($resource) {
      return {
        single: $resource('posts/:postId/:action', {
            postId: '@_id'
          }, {
            like: {
              method: 'POST',
              params: {action: 'like'}
            },
            unlike: {
              method: 'POST',
              params: {action: 'unlike'}
            },
            comment: {
              method: 'POST',
              params: {action: 'comment'}
            },
            likes: {
              method: 'GET',
              params: {action: 'likes'}
            },
            delete: {
              method: 'DELETE',
              params: {action: 'delete'}
            }
          }),
        feed: $resource('posts/'),
        stream: $resource('posts/stream/:streamId'),
        timeline: $resource('posts/timeline/:userId')
      }
    }
  ])
  .filter('appPostFormat', [
    '$sce',
    'appPostsFeed',
    function($sce, appPostsFeed) {
      return function(text) {
        var hashtags = new RegExp('#([A-Za-z0-9]+)', 'g');
        text = text.replace(hashtags, function(hashtag) {
          return '<a href="/feed/'+ hashtag.replace('#', '') +'">' + hashtag + '</a>'
        });

        var mentions = new RegExp('@([A-Za-z0-9_]+)', 'g');
        text = text.replace(mentions, function(mention) {
          return '<a href="/profile/'+ mention.replace('@', '') +'">' + mention + '</a>'
        });

        text = text.replace(new RegExp('\r?\n','g'), '<br />');
        
        /**
         * Emoticons
         */
        var emots = [
          {
            key: ':)',
            value: 'fa-smile-o'
          }, {
            key: ':|',
            value: 'fa-meh-o'
          }, {
            key: ':(',
            value: 'fa-frown-o'
          }, {
            key: '(y)',
            value: 'fa-thumbs-o-up'
          }, {
            key: '(n)',
            value: 'fa-thumbs-o-down'
          }, {
            key: ':+1',
            value: 'fa-thumbs-up'
          }, {
            key: '(h)',
            value: 'fa-heart'
          }, {
            key: '(i)',
            value: 'fa-lightbulb-o'
          },
        ];

        var emotTemplate = '<md-inline-list-icon class="yellow fa {{emoticon}}"></md-inline-list-icon>';
        for (var i in emots) {
          var key = emots[i].key;
          var value = emots[i].value;
          text = text.replace(key, emotTemplate.replace('{{emoticon}}', value));
        };
        
        var videoId = appPostsFeed.getVideoId(text);
        if(videoId !== "" && videoId !== 'error'){
          var iframeMarkup = '<iframe width="100%" height="auto" src="//www.youtube.com/embed/' + videoId + '" frameborder="0" allowfullscreen></iframe>';
          text = text+"<br><br>"+iframeMarkup;
        }
        text = text.replace(/(\b(https?|ftp|file):\/\/[\-A-Z0-9+&@#\/%?=~_|!:,.;]*[\-A-Z09+&@#\/%=~_|])/img, '<a href="$1" target="_blank">$1</a>');

        return $sce.trustAsHtml(text);
      };
    }
  ])
  .filter('appPostByPassFilter', [
    '$sce',
    function($sce) {
      return function(text) {
        return $sce.trustAsHtml(text);
      };
    }
  ])
  .factory('appPostsFeed', [
    'appPosts',
    'ngMeta',
    'MetaTagsService',
    function(appPosts, ngMeta, MetaTagsService) {
      return {
        getFeeds: function(options, cb) {
          options = options || {};
          var userId = options.userId;
          var hashtag = options.hashtag;
          var postId = options.postId;
          var streamId = options.streamId;
          var passedData = options.passedData;
          
          /**
           * Configuration for the service
           * that will also be returned
           * @type {Object}
           */
          var config = options;

          if (userId) {
            /**
             * TIMELINE: If there is a userId, let's load feeds of the specific user
             */
            /**
             * Disable posting
             * @type {Boolean}
             */
            config.noPosting = true;
            /**
             * Show limited comments
             * @type {Boolean}
             */
            config.limitComments = true;

            /**
             * Prepare the request
             */
            var timelineData = appPosts.timeline.get({
              userId: userId,
              timestamp: config.lastUpdated,
              filter: config.feedsFilter,
              limitComments: config.limitComments,
              page: config.feedPage
            }, function() {
              doUpdate(timelineData);
            });

          } else if (streamId) {
            /**
             * STREAM: If there is a streamId, let's load feeds of the specific stream
             */
            
            /**
             * Show limited comments
             * @type {Boolean}
             */
            config.limitComments = true;

            /**
             * Prepare the request
             */
            var streamsData = appPosts.stream.get({
              streamId: streamId,
              timestamp: config.lastUpdated,
              filter: config.feedsFilter,
              limitComments: config.limitComments,
              page: config.feedPage
            }, function() {
              doUpdate(streamsData);
            });
          } else if (postId) {
            /**
             * SINGLE: If there is a postId, let's load a single feed
             */
            /**
             * Disable filtering if its a single feed
             * @type {Boolean}
             */
            config.noFiltering = true;
            /**
             * Disable posting
             * @type {Boolean}
             */
            config.noPosting = true;
            /**
             * No load-more button
             * @type {Boolean}
             */
            config.noMorePosts = true;
            /**
             * Get ready to show all comments
             */
            delete config.limitComments;

            /**
             * Prepare the request
             */
            var timelineData = appPosts.single.get({
              postId: postId, 
              limitComments: config.limitComments,
              allowMarking: true
            }, function() {
              /**
               * The retrieved record is the only one to show
               * @type {Array}
               */
              //Set Meta tag for URL sharing
              ngMeta.setTitle(timelineData.res.record.stream.title);
              ngMeta.setTag('description', timelineData.res.record.content);
              var singleRecord = timelineData.res.record;
              MetaTagsService.setTags({
                // General SEO
                'title': "Tamizhans Social Network",
                // OpenGraph
                'og:type': 'Post',
                'og:url': 'http://www.tamizhans.com/post/'+singleRecord._id,
                'og:title': singleRecord.stream.title,
                'og:description': singleRecord.content,
                //'og:image': singleRecord.image,
                /* Twitter
                'twitter:card': 'summary_large_image',
                'twitter:creator': article.twitter_id,
                'twitter:title': article.title,
                'twitter:description': article.description,
                'twitter:image': article.image,
                */
              });

              timelineData.res.records = [timelineData.res.record];
              doUpdate(timelineData);

              /**
               * Set the last updated timestamp
               */
              config.lastUpdated = Date.now();
              config.showBack = true;
            });
          } else {
            /**
             * FEED: If there is no postId and no userId, let's load the user's latest feed
             */
            /**
             * Limit comments
             * @type {Boolean}
             */
            config.limitComments = true;

            /**
             * Prepare the request
             */
            var feedData = appPosts.feed.get({
              timestamp: config.lastUpdated, 
              filter: config.feedsFilter, 
              limitComments: config.limitComments,
              page: config.feedPage
            }, function() {
              doUpdate(feedData);
            });
          }

          /**
           * If data was sent to the function directly
           * update it for faster client side updates
           */
          if (passedData) {
            doUpdate(passedData);
          }

          /**
           * Default feedcount to 0
           * @type {Number}
           */
          config.newFeedCount = 0;

          /**
           * Function to update the feed on the client side
           * @param  {Object} data The data received from endpoint
           * @return {Void}
           */
          function doUpdate(data) {
            config.lastUpdated = Date.now();
            data.config = config;
            cb(data);
          }

        },
        getVideoId: function(url){
          var ID = '';
          url = url.replace(/(>|<)/gi,'').split(/(vi\/|v=|\/v\/|youtu\.be\/|\/embed\/)/);
          if(url[2] !== undefined) {
            ID = url[2].split(/[^0-9a-z_\-]/i);
            ID = ID[0];
          }
          return ID;
        },
      }
    }
  ])
  .directive('awFeedItem', [
    'appPosts',
    'appWebSocket',
    'appAuth',
    'appToast',
    'appDialog',
    'appLocation',
    function(appPosts, appWebSocket, appAuth, appToast, appDialog, appLocation) {
      return {
        templateUrl: '/modules/posts/views/post-single.html',
        controller: [
          '$scope',
          function($scope) {

            /**
             * Like the post
             * @param  {Object} item The item object
             * @return {Void}      
             */
            $scope.doLike = function(item) {
              item.liked = true;
              appPosts.single.like(item, function(response) {
                angular.extend(item, response.res.record);
              });
            };

            /**
             * Unlike the post
             * @param  {Object} item The item object
             * @return {Void}      
             */
            $scope.undoLike = function(item) {
              item.liked = false;
              appPosts.single.unlike(item, function(response) {
                angular.extend(item, response.res.record);
              });
            };

            /**
             * Comment on a post
             * @param  {Boolean} isValid Will be true if form validation passes
             * @return {Void}
             */
            $scope.comment = function(isValid, item) {
              if (isValid) {
                var commentContent = this.content;
                
                /**
                 * Enable client side comments update for faster response time
                 */
                item.commentEnabled = false;
                item.comments.unshift({
                  creator: appAuth.getUser(),
                  content: commentContent
                });

                item.comment = commentContent;

                appPosts.single.comment(item, function(response) {
                  angular.extend(item, response.res.record);
                  item.commentEnabled = false;
                });
                
              }
            };

            /**
             * Delete the post
             * @param  {Id} item The item id
             * @return {Void}      
             */

            $scope.deleteItem = function(item){
              appPosts.single.delete({
                postId: item._id
              }, function(response) {
                if(response.success == 1){
                  var myEl = angular.element( document.querySelector( '[id="'+item._id+'"]' ) );
                  myEl.remove();
                  appToast(response.res.message);
                }else{
                  alert("Error in deleting the post");
                }
              });
            }

            /**
             * Show the list of likers for a specific post
             * @param  {Object} item The post item
             * @return {Void}
             */
            $scope.showLikers = function(ev, item) {
              /**
               * Get the likers
               */
              appPosts.single.likes({
                postId: item._id
              }, function(response) {
                /**
                 * Show dialog
                 */
                appDialog.show({
                  controller: [
                    '$scope',
                    'appDialog',
                    function($scope, appDialog) {
                      /**
                       * Assign likers to the users variable
                       * @type {Array}
                       */
                      $scope.users = response.res.records;
                      /**
                       * Hide the dialog
                       * @return {Void}
                       */
                      $scope.hide = function() {
                        appDialog.hide();
                      };
                    }
                  ],
                  templateUrl: '/modules/users/views/users-dialog.html',
                  targetEvent: ev,
                });
              });
            };

          }
        ]
      }
    }
  ])
  .service("uploadService", function($http, $q) {

    return ({
      upload: upload
    });

    function upload(file) {
      var upl = $http({
        method: 'POST',
        url: 'http://jsonplaceholder.typicode.com/posts', // /api/upload
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        data: {
          upload: file
        },
        transformRequest: function(data, headersGetter) {
          var formData = new FormData();
          angular.forEach(data, function(value, key) {
            formData.append(key, value);
          });

          var headers = headersGetter();
          delete headers['Content-Type'];

          return formData;
        }
      });
      return upl.then(handleSuccess, handleError);

    } // End upload function

    // ---
    // PRIVATE METHODS.
    // ---
  
    function handleError(response, data) {
      if (!angular.isObject(response.data) ||!response.data.message) {
        return ($q.reject("An unknown error occurred."));
      }

      return ($q.reject(response.data.message));
    }

    function handleSuccess(response) {
      return (response);
    }

  })
  ;
  