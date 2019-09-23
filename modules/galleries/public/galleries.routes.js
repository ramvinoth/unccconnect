'use strict';

angular.module('atwork.galleries')
  .config(['$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
    $routeProvider
      .when('/gallery', {
        templateUrl: '/modules/galleries/views/gallery.html',
        controller: 'GalleryCtrl'
      })
      .when('/gallery/add', {
        templateUrl: '/modules/galleries/views/gallery.html',
        controller: 'GalleryCtrl'
      })
      .when('/gallery/:blogId', {
        templateUrl: '/modules/galleries/views/popup.html',
        controller: 'GalleryCtrl'
      })
      ;
    $locationProvider.html5Mode(true);
  }]);
