/* Copyright (c) 2010 Travis Kriplean (http://www.cs.washington.edu/homes/travis/)
 * Licensed under the MIT License:
 * http://www.opensource.org/licenses/mit-license.php
 * Website: http://www.cs.washington.edu/homes/travis/reflect
 * 
 * 
 * The core Reflect engine.
 * 
 * Powers implementations of Reflect for Wordpress, Greasemonkey, Drupal, Slashcode and 
 * Mediawiki (with LiquidThreads).
 * 
 * Applications need to define the DOM elements that Reflect needs to know about
 * in order for this engine to wrap the basic Reflect comment summarization elements
 * around desired text blocks. Each application should define a reflect.{APPLICATION}.js
 * file where this configuration takes place. 
 * 
 * The script can take it from there. 
 * 
 * Browser compatability (out of date):
 * 
 *   firefox : good
 *    safari : good
 *    chrome : good      
 *    opera : ?
 *    IE6 : ?
 *    IE7 : ugly
 *    IE8 : good
 * 
 */

var Reflect;

(function($j) {
  
/**
* Top-level enclosure. Structure:
* 
*  Reflect
*    .config : default configuration options
*    .Contract : base Class for implementing Reflect contract
*    .api : base Class and methods for interacting with server
*    .handle : methods for responding to events 
*    .templates : contains templates for dynamically adding HTML
*    .enforce_contract : takes a contract and existing DOM and wraps Reflect elements around it
*    .init : fetches data from server, downloads templates, enforces contract, other init-y things
*    .utils : misc methods used throughout
*/    

$j( document ).ready( function () {
  $j.ajaxSetup({ cache: false });

  Reflect.init();
} );


Reflect = {
    
  /**
  * Basic settings. Usually overriden per implementation.
  */        
  config : {
    api : {
      /* Reflect API server */
      server_loc : '',
      /* location where media is served from */
      media_dir : '',
      /* unique identifier for this application */
      domain : ''
    },
    contract : {
      /* components is an array of objects, each of which defines key attributes of 
       * each DOM element which should be wrapped with Reflect text summarization.
       * 
       * The attributes of each component are:
       *   comment_identifier : jquery selector for the comment element
       *   comment_offset : offset within the comment element's ID field where the ID begins
       *   comment_text : jquery selector for the text of the comment
       *   get_commenter_name : function that returns the name of the commenter, given a comment ID
       */        
      components : []
    },
     view : {
       /* Enables client side community moderation of Reflect bullets */
       enable_rating : false,
       /* If the bullet summaries have a picture of the listener. Note that this also requires
          the definition of Reflect.api.server./usr/local/webroot/slash/site/localhost_pic(), as well as having the 
          server return u_pic (a url to the user's pic) for each bullet. */
       uses_profile_pic : false,
       /* Textual prompts */
       text : {
         //bullet_prompt: 'Tell us what you hear {{COMMENTER}} saying', 
         //bullet_prompt: 'Summarize what you hear {{COMMENTER}} saying', 
         //bullet_prompt: 'Summarize {{COMMENTER}}'s point', 
         //bullet_prompt: 'Add a point that {{COMMENTER}} makes',
         //bullet_prompt: 'Restate something {{COMMENTER}} says',
         //bullet_prompt: 'What is {{COMMENTER}}'s point?',
         //bullet_prompt: 'What point is {{COMMENTER}} making?',            
         bullet_prompt: 'What do you hear {{COMMENTER}} saying?',
         response_prompt: 'Did {{LISTENER}} understand your point?',
         bullet_prompt_header: 'Points readers hear {{COMMENTER}} making'
       }
             
     },
    
    study : false
  },

  /**
  * Contract implements methods for identifying key DOM elements, as well as modifying
  * the served DOM, that is necessary for wrapping Reflect elements around comments. 
  * 
  * This is the base class. Reflect implementations should extend Contract in reflect.{APPLICATION}.js.
  */  
  Contract : Class.extend( {
    
    /* jquery selector or function for getting the logged in user */  
    user_name_selector : null,
    
    init : function ( config ) {
      this.components = config.components;
    },
    /* Function that is executed BEFORE the Reflect contract is enforced. 
     * This is where the served DOM is whipped into shape (if it isn't already).*/
    modifier : function () {},
    /* Function executed AFTER the Reflect contract has been enforced.*/
    post_process : function () {},
    /* Returns a jquery-wrapped element representing the comment list.*/    
    get_comment_thread : function () {},
    /* Some applications need to add css in the client. Call _addStyleSheet if needed.*/    
    add_css : function () {},
    _addStyleSheet : function ( style ) {
      $j( 'head' ).append( '<style type="text/css">' + style + '</style>' );
    }
  } ),

  /**
  * Get Reflect moving. 
  * 
  * Fetches data and templates from the server, enforces the contract. 
  */    
  init : function () {
    // register the bridges
    $j.plugin( 'bullet', Reflect.entities.Bullet );
    $j.plugin( 'comment', Reflect.entities.Comment );
    $j.plugin( 'response', Reflect.entities.Response );
    //////////

    // instantiate the classes that may have been overridden
    Reflect.contract = new Reflect.Contract( Reflect.config.contract );
    Reflect.api.server = new Reflect.api.DataInterface( Reflect.config.api );
    //////////

    // handle additional refactoring required for Reflect contract
    Reflect.contract.add_css();
    Reflect.contract.modifier();
    //////////

    // set up event delegation
    Reflect.handle.initialize_delegators();
    /////////////////////////

    //////////
    // figure out which comments are present on the page so that we
    // can ask the server for the respective bullets
    var loaded_comments = [];
    for (i = 0; i < Reflect.contract.components.length; i++) {
      var component = Reflect.contract.components[i];
      $j( component.comment_identifier ).each( function () {
        var comment_id = $j( this ).attr( 'id' )
            .substring( component.comment_offset );
        loaded_comments.push( comment_id );
      } );
    }
    loaded_comments = JSON.stringify( loaded_comments );
    ////////////////////

    function get_data_callback ( data ) {
      Reflect.data = data;
      Reflect.enforce_contract();
      Reflect.contract.post_process();

      if ( Reflect.config.study ) {
        Reflect.study.load_surveys();
        Reflect.study.instrument_mousehovers();
      }      
    }

    function get_templates_callback ( data ) {      
      Reflect.templates.init( data );
      Reflect.api.server.get_data( {
          comments : loaded_comments
        },
        get_data_callback
      );
    }

    // check if templates.html has already been loaded...
    if ( $j('#reflect_templates_present').length ) {
      get_templates_callback( $j('#reflect_templates_present').html() );
    } else {
      Reflect.api.server.get_templates( get_templates_callback );      
    }  

  },

  /**
  * Take the current DOM and wrap Reflect elements where appropriated, guided
  * by the Reflect.contract. 
  */
  enforce_contract : function () {
    $j( Reflect.contract.get_comment_thread() )
        .wrapInner( '<div id="reflected" />' );

    var user = typeof Reflect.contract.user_name_selector == 'function'
      ? Reflect.contract.user_name_selector()
      : $j(Reflect.contract.user_name_selector).text();

    if ( !user || user == '' || user == null || user == 'undefined' ) {
      user = Reflect.api.server.get_current_user();
    }
    
    var user_el = '<span id="rf_user_name">' + user + '</span>';
    $j( '#reflected' ).append( user_el );

    for (i = 0; i < Reflect.contract.components.length; i++) {
      var component = Reflect.contract.components[i];

      $j( component.comment_identifier )
        .each( function ( index ) {
          $j( this ).comment( {
            initializer : component
          });
          var comment = $j.data( this, 'comment' );

          if ( Reflect.data && Reflect.data[comment.id]) {
            var bullets = [];
            $j.each( Reflect.data[comment.id], function(key, val){
              bullets.push( val );      
            })

            // rank order of bullets in list
            bullets = bullets.sort( function ( a, b ) {
              var a_tot = 0.0, b_tot = 0.0;
              for (var j in a.highlights) {
                a_tot += parseFloat(a.highlights[j]);
              }
               for ( var j in b.highlights) {
                b_tot += parseFloat( b.highlights[j] );
              }
              var a_score = a_tot / a.highlights.length,
                b_score = b_tot / b.highlights.length;
              return a_score - b_score;
            } );

            $j.each(bullets, function(key, bullet_info) {

              var bullet = comment.add_bullet( bullet_info ), 
                response = bullet_info.response;
              if ( response ) {
                bullet.add_response( response );
              } else if ( !bullet.response && comment.user == user ) {
                bullet.add_response_dialog();
              }
            });
            comment.hide_excessive_bullets();
          }
          
          // segment sentences we can index them during highlighting
          comment.elements.comment_text.wrap_sentences();
          comment.elements.comment_text.find( '.sentence' )
              .each( function ( index ) {
                $j( this ).attr( 'id', 'sentence-' + index );
              } );
                        
          comment.add_bullet_prompt();

        } );
    }
  },
  /**
  * HTML templates so that we don't have to have long, ugly HTML snippets
  * managed via javascript. Use jquery.jqote2 to implement html templating.
  * HTML file full of scripts is fetched from server. Each script simply
  * contains HTML along with some templating methods. These scripts can 
  * then be created as parameterized HTML via jqote2. 
  * 
  * Reflect.templates stores compiled HTML templates at the ready. 
  */      
  templates : {
    init : function ( templates_from_server ) {      
      $j( 'body' ).append( templates_from_server );
      
      $j.extend( Reflect.templates, {
        bullet : $j.jqotec( '#reflect_template_bullet' ),
        new_bullet_prompt : $j.jqotec( '#reflect_template_new_bullet_prompt' ),
        new_bullet_dialog : $j.jqotec( '#reflect_template_new_bullet_dialog' ),
        bullet_highlight : $j.jqotec( '#reflect_template_bullet_highlight' ),
        response : $j.jqotec( '#reflect_template_response' ),
        response_dialog : $j.jqotec( '#reflect_template_response_prompt' ),
        bullet_rating : $j.jqotec( '#reflect_template_bullet_rating')
      } );      
    }
  },
  
  /**
  * Methods for communicating with a generic Reflect API. Reflect applications 
  * should override the base api.DataInterface class in order to implement the 
  * specific application-specific server calls to the Reflect API. 
  */    
  api : {
    /**
    * This is a base class. Reflect implementations should replace DataInterface with 
    * a child class in reflect.{APPLICATION}.js.
    */    
    DataInterface : Class.extend( {
      init : function ( config ) {
        this.server_loc = config.server_loc;
        this.media_dir = config.media_dir;
        this.domain = config.domain;
      },
      post_bullet : function ( settings ) {
        throw 'not implemented';
      },
      post_response : function ( settings ) {
        throw 'not implemented';
      },
      post_rating : function ( settings ) {
        throw 'not implemented';
      },
      post_survey_bullets : function ( settings ) {
        throw 'not implemented';
      },
      get_data : function ( params, callback ) {
        throw 'not implemented';
      },
      get_current_user : function () {
        return 'Anonymous';
      },
      get_current_user_pic : function () {
        return '';
      },
      get_templates : function ( callback ) {
        throw 'not implemented';
      },
      is_admin : function () {
        return false;
      }
    } ),

    /* Ajax posting of bullet to Reflect API. */        
    post_bullet : function ( event ) {
      
      var bullet_obj = $j.data( $j( event.target )
          .parents( '.bullet' )[0], 'bullet' ), 
        text = $j.trim(bullet_obj.elements.bullet_text.html()), 
        highlights = new Array(),
        modify = bullet_obj.id;

      if ( !modify ) {
        bullet_obj.added_this_session = true
      }

      bullet_obj.comment.elements.comment_text.find( '.highlight' )
        .each( function(){ 
          highlights.push( $j( this ).attr( 'id' ).substring( 9 ) );});

      var params = {
        comment_id : bullet_obj.comment.id,
        text : text,
        user : Reflect.utils.get_logged_in_user(),
        highlights : JSON.stringify( highlights ),
        this_session : bullet_obj.added_this_session
      };

      bullet_obj.set_highlights(highlights);
      if ( bullet_obj.id ) {
        params.bullet_id = bullet_obj.id;
        params.bullet_rev = bullet_obj.rev;
      }

      function post_bullet_callback ( data ) {
        if ( data ) {
          bullet_obj.set_id( data.insert_id, data.rev_id );
          if (!Reflect.data[bullet_obj.comment.id]) {
            Reflect.data[bullet_obj.comment.id] = {};
          }
          Reflect.data[bullet_obj.comment.id][bullet_obj.id] = params;
          if ( Reflect.config.study && !modify ) {
            Reflect.study.new_bullet_survey( 
                bullet_obj, bullet_obj.comment, bullet_obj.$elem );
            Reflect.study.instrument_bullet(bullet_obj.$elem);
          }
        }
      }

      Reflect.api.server.post_bullet( {
        params : params,
        success : post_bullet_callback,
        error : function ( data ) {}
      } );
      bullet_obj.exit_highlight_state( false );
      bullet_obj.comment.add_bullet_prompt();
    },
    
    post_delete_bullet : function ( bullet_obj ) {
      var params = {
        'delete' : true,
        comment_id : bullet_obj.comment.id,
        bullet_id : bullet_obj.id,
        bullet_rev : bullet_obj.rev,
        this_session : bullet_obj.added_this_session
      };

      Reflect.api.server.post_bullet( {params:params} );

      bullet_obj.comment.elements.comment_text.find( '.highlight' )
          .removeClass( 'highlight' );
      bullet_obj.$elem.remove();      
    },
    
    /* Ajax posting of a response to Reflect API. */        
    post_response : function ( response_obj ) {

      function ajax_callback ( data ) {
        var modify = response_obj.id;
        response_obj.set_id( data.insert_id, data.rev_id );
      }
      
      var bullet_obj = response_obj.bullet, 
        text = response_obj.elements.new_response_text.val(), 
        user = Reflect.utils.get_logged_in_user();
      
      var input_sel = "input[name='accurate-"
          + response_obj.bullet.id + "']:checked",
        signal = bullet_obj.$elem.find( input_sel ).val();

      var params = {
        bullet_id : bullet_obj.id,
        comment_id : bullet_obj.comment.id,
        bullet_rev : bullet_obj.rev,
        text : text,
        signal : signal,
        response : true,
        user : user
      };
      if ( response_obj.id ) {
        params.response_id = response_obj.id;
        params.response_rev = response_obj.rev;
      }

      Reflect.api.server.post_response( {
        params : params,
        success : ajax_callback,
        error : function ( data ) {}
      });
    },
    
    post_delete_response : function ( response_obj ) {
      var params = {
        'delete' : true,
        response : true,
        response_id : response_obj.id,
        bullet_id : response_obj.bullet.id,
        bullet_rev : response_obj.bullet.rev,
        comment_id : response_obj.bullet.comment.id
      };
      
      Reflect.api.server.post_response( {params:params} );
    },

    /* Ajax posting of a bullet rating to Reflect API. */        
    post_rating : function ( bullet_obj, rating, is_delete ) {

      function ajax_callback ( data ){
        bullet_obj.ratings.rating = data.rating;
        bullet_obj.$elem.find('.rf_gallery_container')
          .qtip('api').updateContent(Reflect.utils.badge_tooltip(bullet_obj) )
        bullet_obj.$elem.find('.rf_gallery_container')
          .attr({
            'class': data.rating + ' rf_gallery_container'
          });        
      }
      
      var params = {
        bullet_id : bullet_obj.id,
        comment_id : bullet_obj.comment.id,
        bullet_rev : bullet_obj.rev,
        rating : rating,
        is_delete : is_delete
      };

      Reflect.api.server.post_rating( {
        params : params,
        success : ajax_callback,
        error : function ( data ) {}
      });
    }    

  },
  
  /**
  * Event handlers. Naming convention is to have [noun]_[action|event].
  */  
  handle : {
    /**
    * Establishes the event delegators. 
    */
    initialize_delegators : function() {
      //comments
      $j('.rf_comment.highlight_state .rf_comment_text .sentence')
        .live('click', Reflect.handle.sentence_click);

      $j('.rf_comment.highlight_state .rf_comment_text a.exclude_from_reflect')
        .live('click', function( event ){ event.preventDefault(); });

      $j('.rf_comment .rf_toggle_paginate a')
        .live('click', function ( event ) {
          $j( event.target ).parents('.summary').find('.bullet_list').children().fadeIn();
          $j( event.target ).parent().hide();
         });

      // bullets
      $j('.bullet.full_bullet')
        .live('mouseover',  Reflect.handle.bullet_mouseover)
        .live('mouseout',  Reflect.handle.bullet_mouseout);

      $j('.bullet.full_bullet .bullet_meta .delete')
        .live('click',  function( event ) { $j( this ).siblings( '.verification' ).show(); });

      $j('.bullet.full_bullet .bullet_meta .delete_nope')
        .live('click',  function( event ) { $j( this ).parents( '.verification' ).hide(); });      

      $j('.bullet.full_bullet .bullet_meta .delete_for_sure')
        .live('click',  function( event ) {
          var bullet_obj = $j.data( $j( event.target )
              .parents( '.bullet' )[0], 'bullet' );        
          Reflect.api.post_delete_bullet( bullet_obj );
        });

      $j('.bullet.full_bullet .bullet_meta .modify')
        .live('click',  function(event) {
          var bullet_obj = $j.data( $j( event.target )
              .parents( '.bullet' )[0], 'bullet' );
          bullet_obj.enter_edit_state();        
        });

      $j('.bullet.new_bullet .add_bullet')
        .live('click', function(event) {
          var bullet_obj = $j.data( $j( event.target )
              .parents( '.bullet' )[0], 'bullet' );
          bullet_obj.enter_edit_state();
        });

      $j('.bullet.modify .bullet_submit[disabled="false"]')
        .live('click', function(event) { 
          var bullet_obj = $j.data( $j( event.target ).parents( '.bullet' )[0], 'bullet' );
          bullet_obj.exit_edit_state( false );
          bullet_obj.enter_highlight_state();
          if ( bullet_obj.comment.elements.comment_text.find( '.highlight' ).length == 0 ) {
            bullet_obj.elements.submit_button.attr( 'disabled', true );
          }
        });

      $j('.bullet.modify .cancel_bullet')
        .live('click', function(event) { 
          var bullet_obj = $j.data( $j( event.target ).parents( '.bullet' )[0], 'bullet' );
          bullet_obj.exit_edit_state( true );
        });      

      $j('.bullet.connect .submit .bullet_submit[disabled="false"]')
        .live('click', Reflect.api.post_bullet);

      $j('.bullet.connect .submit .cancel_bullet')
        .live('click', function(event) { 
          var bullet_obj = $j.data( $j( event.target ).parents( '.bullet' )[0], 'bullet' );
          bullet_obj.exit_highlight_state( true );});

      $j('.bullet.connect .submit .cancel_bullet')
        .live('click', function(event) {
          var comment = $j.data( $j( event.target ).parents( '.bullet' )[0], 'bullet' ).comment; 
          comment.add_bullet_prompt();
      });

      // responses
      $j('.bullet.full_bullet .response_prompt')
        .live('click', function( event ) { 
          $j( this ).find('.response_eval').slideDown(); 
          $j( this ).find('.action_call').hide();
        });

      $j('.bullet.full_bullet .response_prompt .response_maybe')
        .live('click', function( event ) { 
          $j( this ).siblings('.response_dialog').find('.new_response_text')
            .focus();
        });

      $j('.bullet.full_bullet .response_prompt .bullet_submit')
        .live('click', function( event ) { 
          var response_obj = $j.data( $j( event.target )
              .parents( '.bullet' ).find('.rf_response')[0], 'response' );
          if ( response_obj.$elem.find('input:checked').length > 0 ) {
            Reflect.api.post_response( response_obj );
            response_obj.exit_dialog( false );
          }
        });

      $j('.bullet.full_bullet .response_prompt .cancel_bullet')
        .live('click', function( event ) {  
          $j(event.target).parents('.response_eval').slideUp();
          $j(event.target).parents('.response_prompt').find('.action_call').fadeIn();
          return false;
        } );

    },        
    bullet_mouseover : function ( event ) {
      var bullet_obj = $j.data( $j( this )[0], 'bullet' );

      bullet_obj.comment.$elem.not('highlight_state').not('bullet_state')
        .find( jQuery.map(bullet_obj.highlights, function(n, i){return '#sentence-' + n;}).join(',') )
        .addClass('highlight');
    },
    
    bullet_mouseout : function ( event ) {      
      var comment = $j
        .data( $j( event.target ).parents( '.rf_comment' )[0], 'comment' );

      if ( !comment.$elem.hasClass( 'highlight_state' )
          && !comment.$elem.hasClass( 'bullet_state' ) ) {
        comment.$elem.find( '.highlight' ).removeClass( 'highlight' );
      }      
    },

    bullet_flag : function ( event, bullet_obj ) {
      var flag = $j( event.currentTarget ).attr('name'),
          is_delete = flag in bullet_obj.flags && flags[flag] > 0;
      
      if ( !is_delete ) {
        bullet_obj.my_rating = flag;
        $j( event.currentTarget )
          .siblings('.selected').removeClass('selected');
      }

      $j( event.currentTarget )
        .toggleClass('selected');

      bullet_obj.flags[flag] = is_delete ? -1 : 1;
      Reflect.api.post_rating( bullet_obj, flag, is_delete );
    },

    negative_count : function ( t_obj, char_area, c_settings, char_rem ) {
      if ( !char_area.hasClass( 'too_many_chars' ) ) {
        char_area.addClass( 'too_many_chars' );

        t_obj.parents( '.rf_dialog' ).find( '.bullet_submit' )
            .animate( {
              opacity : .25,
              duration : 50
            } ).attr( 'disabled', true ).css( 'cursor', 'default' );
        t_obj.data( 'disabled', true );

      }
    },
    positive_count : function ( t_obj, char_area, c_settings, char_rem ) {
      if ( char_area.hasClass( 'too_many_chars' ) ) {
        char_area.removeClass( 'too_many_chars' );

        t_obj.parents( '.rf_dialog' ).find( '.bullet_submit' )
            .animate( {
              opacity : 1,
              duration : 50
            } ).attr( 'disabled', false ).css( 'cursor', 'pointer' );
        t_obj.data( 'disabled', false );
      } else if ( char_rem < 140 && t_obj.data( 'disabled' ) ) {
        t_obj.data( 'disabled', false );
        t_obj.parents( 'li' ).find( '.submit .bullet_submit' )
            .attr( 'disabled', false );
      } else if ( char_rem == 140 && t_obj.parents('.response_dialog').length == 0 ) {
        t_obj.data( 'disabled', true );
        t_obj.parents( 'li' ).find( '.submit .bullet_submit' )
            .attr( 'disabled', true );
      }
    },
    sentence_click : function ( event ) {
      var parent = $j( event.target ).parents( '.rf_comment' ), 
          comment = $j.data( parent[0], 'comment' );
          bullet = parent.find( '.connect_directions' )
            .parents( '.bullet' ).data( 'bullet' ), 
          submit = bullet.elements.submit_button;

      submit.attr( 'disabled', $j( event.target ).hasClass( 'highlight' ) 
             && parent.find( '.rf_comment_text .highlight' ).length == 1 );
      $j( event.target ).toggleClass( 'highlight' );
    }

  },

  /**
  * Object classes representing important object types: 
  * Comment, Bullet, and Response. 
  * 
  * Instantiations of each object class are attached to their respective DOM 
  * elements via jquery.data. And each object maintains reference to DOM 
  * element reference. 
  * 
  * Object instances know how to transform their own DOM given state changes. 
  * More than meets the eye. 
  * 
  * They also know how to manage adding children. For example, Comment knows
  * how to add Bullets. 
  * 
  * Instantiation is accomplished via jquery.plugin, enabling 
  * e.g. $j('#comment').comment(). Plugin registration accomplished in 
  * Reflect.init.
  */    
  entities : {

    Comment : {
      init : function ( options, elem ) {
        this.options = $j.extend( {}, this.options, options );

        this.$elem = $j( elem );
        this.elements = {};

        this.id = this.$elem.attr( 'id' )
            .substring( this.options.initializer.comment_offset );
      
        this.user = this.options.initializer.get_commenter_name( this.id );
        if ( this.user == '' || this.user == null ) {
          this.user = 'Anonymous';
        }
        this.user_short = Reflect.utils.first_name( this.user );
        this.bullets = [];
        this._build();
        return this;
      },
      options : {},
      _build : function () {
        var comment_text = this.$elem
            .find( this.options.initializer.comment_text + ':first' );
        this.$elem.addClass( 'rf_comment' );

        var wrapper = $j( '' 
            + '<td id="rf_comment_text_wrapper-'
            + this.id + '" class="rf_comment_text_wrapper">'
            + '<div class=rf_comment_text />' + '</td>' );

        var summary_block = $j( '' 
            + '<td id="rf_comment_summary-'
            + this.id + '" class="rf_comment_summary">'
            + '<div class="summary" id="summary-' + this.id + '">'
            + '<div class="reflect_header"><div class="rf_title">'
            + Reflect.config.view.text.bullet_prompt_header.replace('{{COMMENTER}}', this.user_short)
            + '</div></div>'
            + '<ul class="bullet_list" />' + '</div>' + '</td>' );

        var author_block = $j( '<span class="rf_comment_author">' 
            + this.user + '</span>' );
        
        wrapper.append( author_block );
        
        comment_text
            .wrapInner( wrapper )
            .append( summary_block )
            .wrapInner( $j( '<tr/>' ) )        
            .wrapInner( $j( '<table id="rf_comment_wrapper-' 
                + this.id + '" class="rf_comment_wrapper" />' ) );
        
        //so that we don't try to break apart urls into different sentences...
        comment_text.find('a').addClass('exclude_from_reflect');
                  
        this.elements = {
          bullet_list : comment_text.find( '.bullet_list:first' ),
          comment_text : this.$elem.find( '.rf_comment_text:first' ),
          text_wrapper : this.$elem.find( '.rf_comment_text_wrapper:first' ),
          summary : this.$elem.find( '.rf_comment_summary' )
        };

      },
      _add_bullet : function ( params ) {
        var bullet = $j( '<li />' ).bullet( params );

        this.elements.bullet_list.append( bullet );

        var bullet_obj = $j.data( bullet[0], 'bullet' );
        this.bullets.push( bullet_obj );
        return bullet_obj;
      },
      add_bullet : function ( bullet_info ) {
        return this._add_bullet( {
          is_prompt : false,
          bullet_info : bullet_info,
          comment : this
        } );
      },
      add_bullet_prompt : function () {
        if ( this.user == Reflect.utils.get_logged_in_user()
            || this.elements.bullet_list.find( '.new_bullet' ).length > 0) {
          return;
        }

        return this._add_bullet( {
          is_prompt : true,
          comment : this
        } );
      },
      hide_excessive_bullets : function() {
        if ( this.bullets.length < 2 ) {
          return;
        }
        var HIDE_FACTOR = 1.5,
          comment_text_height = this.elements.comment_text.height();
        if ( this.elements.bullet_list.height() > HIDE_FACTOR * comment_text_height ) {
          var i = this.bullets.length - 1;
          while (  i > 0 
            && this.elements.bullet_list.height() > HIDE_FACTOR * comment_text_height ) {
            this.bullets[i].$elem.hide();
            i -= 1; 
          }
          var hidden = this.bullets.length - i - 1,
            summary = hidden == 1 ? 'summary' : 'summaries';
          this.$elem.find('.reflect_header')
            .append('<div class="rf_toggle_paginate">' + hidden + ' ' + summary + ' hidden. <a>show all</a></div><div class="cl"></div>');
          this.elements.summary.css('padding-top', parseInt(this.elements.summary.css('padding-top')) - 20);
        }
       }
    },

    Bullet : {
      init : function ( options, elem ) {
        this.options = $j.extend( {}, this.options, options.bullet_info );
        this.comment = options.comment;
        
        this.$elem = $j( elem );
        this.elements = {};

        this.set_attributes();
        this.response = null;
        this.flags = {};
        this.ratings = this.options.ratings;
        
        if ( this.options.my_rating && this.options.my_rating != 'undefined' ) {
          this.my_rating = this.options.my_rating;
          this.flags[this.my_rating] = 1;
        }
        // Build the dom initial structure
        if ( options.is_prompt ) {
          this._build_prompt();
        } else {
          this._build();
        }
        return this;
      },
      set_attributes : function () {
        this.id = this.options.id ? this.options.id : null;
        this.rev = this.options.rev ? this.options.rev : null;
        this.user = this.options.u ? this.options.u : null;
        this.highlights = this.options.highlights ? this.options.highlights : null;
        this.text = this.options.txt ? this.options.txt : null;
      },
      options : {},
      _build : function () {
        var logged_in_user = Reflect.utils.get_logged_in_user(),
            template_vars = {
          bullet_text : Reflect.utils.escape( this.text ),
          user : Reflect.utils.escape( this.user ),
          listener_pic : this.options.u_pic,
          uses_profile_pic : Reflect.config.view.uses_profile_pic,
          rating : this.ratings ? this.ratings.rating : null,
          enable_rating : Reflect.config.view.enable_rating,
          allow_rating : logged_in_user != this.comment.user
            && logged_in_user != this.user,
          enable_actions : Reflect.api.server.is_admin()
            || (logged_in_user != 'Anonymous' && logged_in_user == this.user && !this.response)
            || (logged_in_user == 'Anonymous' && logged_in_user == this.user && this.added_this_session)
        };

        this.$elem
            .addClass( 'bullet' )
            .html( $j.jqote( Reflect.templates.bullet, template_vars ) );
        
        if ( this.user == logged_in_user ) {
          this.$elem.addClass( 'self' );
        } else if ( this.options.commenter == logged_in_user ) {
          this.$elem.addClass( 'responder_viewing' );
        }

        if ( this.id ) {
          this.set_id( this.id, this.rev );
          this.$elem.addClass( 'full_bullet' )
        }

        this.elements = {
          bullet_text : this.$elem.find( '.rf_bullet_text' ),
          bullet_main : this.$elem.find( '.bullet_main' ),
          bullet_meta : this.$elem.find( '.bullet_meta' ),
          bullet_eval : this.$elem.find( '.rf_evaluation' )
        };
        
        if ( this.id && !this.added_this_session ) {
          var me = this,
            qtip_settings = $j.extend( true, Reflect.default_third_party_settings.qtip(35), {
              content : Reflect.utils.badge_tooltip(this),
              api : {
                beforeShow: function(){
                  return !!me.ratings.rating;
                }                
              }
            });

          this.elements.bullet_eval.find( '.rf_gallery_container' ).qtip(qtip_settings);
                    
          var template_vars = {
             bullet_author : Reflect.utils.first_name(this.user),
             rating : this.my_rating,
             ratings : this.ratings
          }, selector_container = this.elements.bullet_eval.find( '.rf_rating .rf_selector_container' );

          qtip_settings = $j.extend( true, Reflect.default_third_party_settings.qtip(50), {
            content: $j.jqote( Reflect.templates.bullet_rating, template_vars ),
            position: { adjust: { y: 0, x: 10}},
            hide: { fixed : true },
            style: { padding : 0 },
            api: {
              onRender: function(){
                this.elements.tooltip.find( '.flag' )
                  .bind( 'click', function(event){
                    Reflect.handle.bullet_flag(event, me) ;
                    selector_container.qtip('hide');
                  });
              }
            }
          });

          selector_container.qtip(qtip_settings);
        }
      },
      _build_prompt : function () {
        var commenter = this.comment.user;
        var template_vars = {
          commenter : commenter,
          media_dir : Reflect.config.api.media_dir,
          bullet_prompt : Reflect.config.view.text.bullet_prompt.replace('{{COMMENTER}}', commenter)
        };
        
        var template = Reflect.templates.new_bullet_prompt;
        
        this.$elem
            .addClass( 'bullet new_bullet' )
            .html( $j.jqote( template, template_vars ) );
      },
      set_id : function ( id, rev ) {
        this.id = this.options.id = parseInt(id);
        this.rev = this.options.rev = parseInt(rev);
        this.$elem.attr( 'id', 'bullet-' + this.id );
      },
      set_highlights : function (highlights) {
        this.highlights = this.options.highlights = highlights;
      },
      enter_edit_state : function () {
        var text = this.id ? $j.trim(this.elements.bullet_text.html()) : '',
         template_vars = {
          media_dir : Reflect.api.server.media_dir,
          bullet_id : this.id,
          txt : Reflect.utils.escape( text ),
          commenter : this.comment.user_short,
        };
        this.$elem
          .addClass( 'modify' )
          .html( 
            $j.jqote( Reflect.templates.new_bullet_dialog, template_vars ) );

        this.comment.$elem.addClass( 'bullet_state' );
        this.elements = {
          new_bullet_text : this.$elem.find( '.new_bullet_text' ),
          bullet_text : this.$elem.find( '.rf_bullet_text' ),
          submit_button : this.$elem.find( '.submit .bullet_submit' )
        };
        
        var settings = Reflect.default_third_party_settings.noblecount(), 
            count_sel = '#rf_comment_wrapper-' + 
            this.comment.id + ' .bullet.modify li.count';
            
        this.elements.new_bullet_text.NobleCount(count_sel , settings );
        this.options.text_backup = this.text;
        
        // wont work in Greasemonkey
        try {
          this.elements.new_bullet_text.focus();
        } catch ( err ) {}

      },
      exit_edit_state : function ( canceled ) {
        this.comment.$elem.removeClass( 'bullet_state' );
        this.$elem.removeClass( 'modify' );
        if ( canceled && !this.id ) {
          this._build_prompt();
        } else {
          $j.extend( this.options, {
            listener_pic:Reflect.api.server.get_current_user_pic(),
            txt: canceled ? this.options.txt : this.elements.new_bullet_text.val(),
            u: Reflect.utils.get_logged_in_user() } );
          
          this.set_attributes();
          this._build();
        }
      },
      enter_highlight_state : function () {
        this.$elem.addClass('connect');
        this.comment.$elem.addClass( 'highlight_state' );
        
        var child = $j('<div />')
            .addClass('rf_dialog')
            .append( $j.jqote( Reflect.templates.bullet_highlight ));
        this.elements.bullet_main.append( child );
        this.elements.submit_button = this.$elem.find( '.submit .bullet_submit' );
      },
      exit_highlight_state : function ( canceled ) {
        this.comment.$elem.removeClass( 'highlight_state' );
        
        if ( canceled & !this.id ) {
          this._build_prompt();
          this.$elem.removeClass( 'connect' );
        } else {
          if ( canceled ) {
            this.options.txt = this.options.text_backup;
            this.elements.bullet_text.text(this.options.txt);
          }
          this.$elem
            .removeClass( 'new_bullet' )
            .addClass( 'full_bullet' );
          var me = this;
          this.$elem.find( '.rf_dialog' ).fadeOut(200, function(){
            me.$elem.removeClass( 'connect' );
            $j(this).remove();
          });
          me.set_attributes();
        }
        this.comment.elements.text_wrapper.find( '.highlight' )
            .removeClass( 'highlight' );
      },
      _add_response : function ( params ) {
        var response = $j( '<li />' ).response( params );
        this.elements.bullet_eval.find('.rf_rating').after( response );
        this.response = response;
        this.$elem.addClass('has_response');
        return $j.data( response[0], 'response' );
      },
      add_response : function ( response_info ) {
        this.elements.bullet_meta.remove();
        return this._add_response( {
          response_info : response_info,
          is_prompt : false,
          bullet : this
        } );
      },
      add_response_dialog : function () {
        return this._add_response( {
          media_dir : Reflect.api.server.media_dir,
          is_prompt : true,
          bullet : this
        } );
      }
    },

    Response : {
      init : function ( options, elem ) {
        this.options = $j.extend( {}, this.options, options.response_info );
        this.$elem = $j( elem );
        this.bullet = options.bullet;

        this.set_attributes();
        this.elements = {};

        if ( options.is_prompt ) {
          this._build_prompt();
        } else {
          this._build();
        }
        return this;
      },
      options : {},
      set_attributes : function () {
        this.id = parseInt(this.options.id);
        this.rev = parseInt(this.options.response_rev);
        this.user = this.options.u;
        this.text = Reflect.utils.escape( this.options.txt );
      },
      _build : function () {
        var first_name = Reflect.utils.first_name(this.user),
          tag = Reflect.utils.escape( String(this.options.sig) );
        
        if ( tag == '2' || tag == '0' ) {
          switch ( tag ) {
            case '2':
              var tip = this.user + ' confirms that this summary is accurate.';
              break;
            case '0':
              var tip = this.user + ' does not think this is a summary.';
              break;
          }
          var qtip_settings = $j.extend(true, Reflect.default_third_party_settings.qtip(140), {
            content : tip,
            style : { width : 140 }
          });
          
          this.$elem
            .html($j.jqote( Reflect.templates.response, {
                sig : tag,
                user : Reflect.utils.escape( first_name )
            }))
            .qtip(qtip_settings);
             
        } else if ( tag == '1' ) {
          this.bullet.$elem.append('<div class="rf_clarification"><span>clarification:</span>' + this.text + ' - ' + first_name + '</div>')
        }
        
        this.$elem.addClass( 'rf_response' );
        this.set_id( this.id, this.rev );
      },
      _build_prompt : function () {
        var template_vars = {
            bullet_id : this.bullet.id,
            text : this.text,
            sig : Reflect.utils.escape( String(this.options.sig) ),
            user : Reflect.utils.escape( this.user ),
            summarizer : this.bullet.user,
            response_prompt : Reflect.config.view.text.response_prompt.replace('{{LISTENER}}', this.bullet.user)            
          };
          
        this.bullet.elements.bullet_main.append($j.jqote( Reflect.templates.response_dialog, template_vars ));
        this.$elem.addClass( 'rf_response');
        
        this.elements = {
          prompt : this.bullet.$elem.find( '.response_prompt' ),
          new_response_text : this.bullet.$elem.find( '.new_response_text' ),
          submit_button : this.$elem.find( '.submit .bullet_submit' )
        };

        var settings = Reflect.default_third_party_settings.noblecount(),
            count_sel = '#bullet-' 
            + this.bullet.id 
            + ' .response_prompt li.count';
        this.elements.new_response_text.NobleCount( count_sel, settings );    

      },
      set_id : function ( id, rev ) {
        this.id = id;
        this.rev = rev;
        this.$elem.attr( 'id', 'response-' + this.id );
      },
      exit_dialog : function ( canceled ) {   
        var accurate_sel = "input[name='accurate-" + this.bullet.id + "']:checked";
        
        $j.extend( this.options, {
            user : Reflect.utils.get_logged_in_user(),
            txt : this.elements.new_response_text.val(),
            sig : this.elements.prompt.find( accurate_sel ).val()            
          });
        this.elements.prompt.remove();
        this._build();
        this.set_attributes();
        this.$elem.removeClass('new');
      }
    }

  },
  /**
  * Your standard misc collection of functions. 
  */    
  utils : {
    /* escape the string */
    escape : function (str) {
      if ( str ) {
        return $j('<div/>')
          .text(str.replace(/\\"/g, '"').replace(/\\'/g, "'"))
          .html();
      } else {
        return '';
      }
    },
    
    first_name : function ( full_name ) {
      if (full_name.indexOf(' ') > -1){
        full_name = full_name.substring(0, full_name.indexOf(' '));
      }      
      return full_name;
    },
    
    get_logged_in_user : function () {
      if ( typeof Reflect.current_user == 'undefined' ) {
        Reflect.current_user = $j( '#rf_user_name' ).text();
      }
      return Reflect.current_user;
    },

    badge_tooltip : function ( bullet_obj ) {
      var tip = '<div class="badge_tooltip">',
          rating = bullet_obj.ratings.rating;
          
      if ( bullet_obj.ratings ) {
        switch ( rating ) {
          case 'zen':
            tip += 'This summary is an elegant, zen-like distillation of meaning.';
            break;
          case 'sun':
            tip +=  'This summary helps shed light on what the commenter was trying to say.';
            break;
          case 'gold':
            tip +=  'This summary uncovers an important point that could easily be missed.';
            break;
          case 'graffiti':
            tip +=  'This does not appear to be a summary.';
            break;
          case 'troll':
            tip +=  'Readers believe this summary is antagonizing...nitpicky...sarcastic. In short, trolling.'; 
            break;
        }
      }
      if ( !bullet_obj.my_rating ) {
        var person_str = bullet_obj.ratings[rating] == 1 ? 'person' : 'people';
        tip += '<div class="according_to">' + bullet_obj.ratings[rating] + ' ' + person_str + '</div>';        
      } else if ( bullet_obj.my_rating == rating ) {
        var others = '';
        if ( bullet_obj.ratings[rating] == 1 ) { 
          others = ' one other';
        } else if ( bullet_obj.ratings[rating] > 1 ) {
          others = ' ' + bullet_obj.ratings[rating] + ' others'
        }
        tip += '<div class="according_to">You' + others + ' agree</div>';
      } else {
        tip += '<div class="according_to">' + bullet_obj.ratings[rating] + ' ' + person_str + '. You disagree</div>';        
      }

      return tip + '</div>';
    }
    
  },
  
  default_third_party_settings : {
    qtip: function ( delay ){
      return {
        show : { delay: delay },
        position : { 
          corner: {
            target: 'bottomRight',
            tooltip: 'topRight'
          },
        },              
        style: {
          background: '#e1e1e1',
          color: '#4d4d4d',
          border: {
            width: 3,
            radius: 0,
            color: '#066'
          }
        }
      }
    },
    noblecount: function () {
      return {
        on_negative : Reflect.handle.negative_count,
        on_positive : Reflect.handle.positive_count,
        max_chars : 140
      }
    }
  }
};
  

})(jQuery);
