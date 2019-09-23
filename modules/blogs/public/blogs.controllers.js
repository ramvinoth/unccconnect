'use strict';

angular.module('atwork.blogs', ['summernote'])
  .controller('BlogsCtrl', [
    '$scope',
    '$rootScope',
    '$routeParams',
    '$timeout',
    'appAuth',
    'appToast',
    'appStorage',
    'appLocation',
    'appWebSocket',
    'appBlogs',
    'appBlogsFeed',
    'resolvedBlogs',
    'htmlToPlaintextFilter',
    function($scope, $rootScope, $routeParams, $timeout, appAuth, appToast, appStorage, appLocation, appWebSocket, appBlogs, appBlogsFeed, resolvedBlogs, htmlToPlaintextFilter) {
      
      $scope.content = '';
      $scope.lastUpdated = 0;
      $scope.postForm = '';
      $scope.newFeedCount = 0;
      $scope.feed = [];
      $scope.feedsFilter = '';
      $scope.limitComments = true;
      $scope.feedPage = 0;
      $scope.showBack = false;
      $scope.mentionsResults = [];

      var blogId = $scope.detailPage = $routeParams.blogId;

      $scope.options = {
        height: 300,
        focus: true,
        airMode: false,
        toolbar: [
                ['edit',['undo','redo']],
                ['headline', ['style']],
                ['style', ['bold', 'italic', 'underline', 'superscript', 'subscript', 'strikethrough', 'clear']],
                ['fontface', ['fontname']],
                ['textsize', ['fontsize']],
                ['fontclr', ['color']],
                ['alignment', ['ul', 'ol', 'paragraph', 'lineheight']],
                ['height', ['height']],
                ['table', ['table']],
                ['insert', ['link','picture','video','hr']],
                ['view', ['fullscreen', 'codeview']],
                ['help', ['help']]
            ]
      };
      $scope.content = "Hello World";
      $scope.title = "";


      
      /**
       * Initial feeds
       */
      angular.extend($scope, resolvedBlogs.config);
      doUpdate(resolvedBlogs);
      /**
       * Function to update the feed on the client side
       * @param  {Object} data The data received from endpoint
       * @return {Void}
       */
      function doUpdate(data) {
        var options = data.config || {};

        /**
         * If it's a filter request, empty the feeds
         */
        if ($scope.feedsFilter && !options.append) {
          $scope.feed = [];
        }
        /**
         * Check whether to append to feed (at bottom) or insert (at top)
         */
        if (!options.append) {
          $scope.feed = data.res.records.concat($scope.feed);
        } else {
          $scope.feed = $scope.feed.concat(data.res.records);
        }

        /**
         * Check if there are more pages
         * @type {Boolean}
         */
        $scope.noMorePosts = !data.res.morePages;
        /**
         * Set the updated timestamp
         */
        $scope.lastUpdated = Date.now();
        $scope.showBack = false;

        /**
         * Set page title
         */
        if ($scope.timelinePage) {
          $scope.feedTitle = 'Blogs';
        }
      }

      /**
       * Create a new post
       * @param  {Boolean} isValid Will be true if form validation passes
       * @return {Void}
       */
      $scope.create = function(isValid, item) {
        if (isValid) {
          var blog = new appBlogs.single({
            title: this.title,
            short_title: htmlToPlaintextFilter(this.title).substr(0, 20)+"...",
            content: this.content,
            short_desc: htmlToPlaintextFilter(this.content).substr(0, 50)+"...",
          });
          
          blog.$save(function(response) {
            if (response.success) {
              
              /**
               * We are the creator ourselves, we know that
               * @type {Object}
               */
              response.res = angular.extend(response.res, {
                creator: appAuth.getUser()
              });
              appLocation.url('/blog');
              /**
               * Update feed
               * @type {Object}
               */
              
               //$scope.updateFeed();

              //$scope.reset();
            } else {
              $scope.failure = true;
              appToast(response.res.message);
            }
          });
        } else {
          
        }
      };

      $scope.viewBlog = function(blogId){
        appLocation.url('/blog/'+blogId);
      };

      /**
       * Update a single item in the existing list if it exists
       * @param  {[type]} postId [description]
       * @return {[type]}        [description]
       */
      var updateItem = function(e, data) {
        _.each($scope.feed, function(candidate, i) {
          if (candidate._id == data.postId) {
            (function(item) {
              var params = {
                postId: data.postId
              };
              if ($scope.detailPage && item._id === $routeParams.postId) {
                params.allowMarking = true;
              }
              if (item._id == data.postId) {
                var post = appBlogs.single.get(params, function() {
                  angular.extend(item, post.res.record);
                });
              }
            })(candidate);
          }

        });
      };

      /**
       * Enable socket listeners
       */
      $rootScope.$on('like', updateItem);
      $rootScope.$on('unlike', updateItem);
      $rootScope.$on('comment', updateItem);


      /**
       * Like the post
       * @param  {Object} item The item object
       * @return {Void}      
       */
      $scope.doLike = function(item) {
        item.liked = true;
        appBlogs.single.like(item, function(response) {
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
        appBlogs.single.unlike(item, function(response) {
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

          appBlogs.single.comment(item, function(response) {
            angular.extend(item, response.res.record);
            item.commentEnabled = false;
          });
          
        }
      };

      /**
       * Show the list of likers for a specific post
       * @param  {Object} item The post item
       * @return {Void}
       */
      $scope.showLikers = function(ev, item) {
        /**
         * Get the likers
         */
        appBlogs.single.likes({
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
  ])
  .controller('AddBlogCtrl' [
    '$scope',
    '$rootScope',
    '$routeParams',
    '$timeout',
    'appAuth',
    'appToast',
    'appStorage',
    'appLocation',
    'appWebSocket',
    'appBlogsFeed',
    function($scope, $rootScope, $routeParams, $timeout, appAuth, appToast, appStorage, appLocation, appWebSocket, appBlogsFeed){
      $scope.title= "Hello World";
    }
  ])
  ;

  angular.module('textAngularEditor', ['textAngular', 'ngMaterial'])
.config(['$provide', function ($provide) {
        $provide.decorator('taOptions', ['$delegate', function (taOptions) {
            taOptions.forceTextAngularSanitize = true;
            taOptions.keyMappings = [];
            taOptions.toolbar = [
                ['h1', 'h2', 'h3', 'p', 'pre', 'quote'],
                ['bold', 'italics', 'underline', 'ul', 'ol', 'redo', 'undo', 'clear'],
                ['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'],
                ['html', 'insertImage', 'insertLink']
            ];
            taOptions.classes = {
                focussed: '',
                toolbar: 'ta-toolbar',
                toolbarGroup: 'ta-button-group',
                toolbarButton: '',
                toolbarButtonActive: 'active',
                disabled: 'disabled',
                textEditor: 'ta-text-editor',
                htmlEditor: 'md-input'
            };
            return taOptions;
        }]);
        $provide.decorator('taTools', ['$delegate', function (taTools) {
            taTools.h1.display = '<md-button aria-label="Heading 1">H1</md-button>';
            taTools.h2.display = '<md-button aria-label="Heading 2">H2</md-button>';
            taTools.h3.display = '<md-button aria-label="Heading 3">H3</md-button>';
            taTools.p.display = '<md-button aria-label="Paragraph">P</md-button>';
            taTools.pre.display = '<md-button aria-label="Pre">pre</md-button>';
            taTools.quote.display = '<md-button class="md-icon-button" aria-label="Quote"><md-icon md-font-set="material-icons">format_quote</md-icon></md-button>';
            taTools.bold.display = '<md-button class="md-icon-button" aria-label="Bold"><md-icon md-font-set="material-icons">format_bold</md-icon></md-button>';
            taTools.italics.display = '<md-button class="md-icon-button" aria-label="Italic"><md-icon md-font-set="material-icons">format_italic</md-icon></md-button>';
            taTools.underline.display = '<md-button class="md-icon-button" aria-label="Underline"><md-icon md-font-set="material-icons">format_underlined</md-icon></md-button>';
            taTools.ul.display = '<md-button class="md-icon-button" aria-label="Buletted list"><md-icon md-font-set="material-icons">format_list_bulleted</md-icon></md-button>';
            taTools.ol.display = '<md-button class="md-icon-button" aria-label="Numbered list"><md-icon md-font-set="material-icons">format_list_numbered</md-icon></md-button>';
            taTools.undo.display = '<md-button class="md-icon-button" aria-label="Undo"><md-icon md-font-set="material-icons">undo</md-icon></md-button>';
            taTools.redo.display = '<md-button class="md-icon-button" aria-label="Redo"><md-icon md-font-set="material-icons">redo</md-icon></md-button>';
            taTools.justifyLeft.display = '<md-button class="md-icon-button" aria-label="Align left"><md-icon md-font-set="material-icons">format_align_left</md-icon></md-button>';
            taTools.justifyRight.display = '<md-button class="md-icon-button" aria-label="Align right"><md-icon md-font-set="material-icons">format_align_right</md-icon></md-button>';
            taTools.justifyCenter.display = '<md-button class="md-icon-button" aria-label="Align center"><md-icon md-font-set="material-icons">format_align_center</md-icon></md-button>';
            taTools.justifyFull.display = '<md-button class="md-icon-button" aria-label="Justify"><md-icon md-font-set="material-icons">format_align_justify</md-icon></md-button>';
            taTools.clear.display = '<md-button class="md-icon-button" aria-label="Clear formatting"><md-icon md-font-set="material-icons">format_clear</md-icon></md-button>';
            taTools.html.display = '<md-button class="md-icon-button" aria-label="Show HTML"><md-icon md-font-set="material-icons">code</md-icon></md-button>';
            taTools.insertLink.display = '<md-button class="md-icon-button" aria-label="Insert link"><md-icon md-font-set="material-icons">insert_link</md-icon></md-button>';
            taTools.insertImage.display = '<md-button class="md-icon-button" aria-label="Insert photo"><md-icon md-font-set="material-icons">insert_photo</md-icon></md-button>';
            return taTools;
        }]);
    }]);