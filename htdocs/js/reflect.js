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
 * 	firefox : best
 *		safari : good
 *		chrome : good			
 *		opera : untested
 *		IE6 : unusable
 *		IE7 : ugly as hell
 *		IE8 : ugly
 * 
 */

var Reflect;

(function($) {
  
//var $j = jQuery.noConflict();
var $j = jQuery;

/**
* Top-level enclosure. Structure:
* 
*  Reflect
*    .config : default configuration options
*    .Contract : base Class for implementing Reflect contract
*    .api : base Class and methods for interacting with server
*    .bind : attach event handlers to relevant objects before/after state transition
*    .handle : methods for responding to events 
*    .transitions : methods implementing logic for handling state transitions
*    .templates : contains templates for dynamically adding HTML
*    .enforce_contract : takes a contract and existing DOM and wraps Reflect elements around it
*    .init : fetches data from server, downloads templates, enforces contract, other init-y things
*    .utils : misc methods used throughout
*/		

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
			 * 	 comment_identifier : jquery selector for the comment element
			 *   comment_offset : offset within the comment element's ID field where the ID begins
			 *	 comment_text : jquery selector for the text of the comment
			 *	 get_commenter_name : function that returns the name of the commenter, given a comment ID
			 */				
			components : []
		},
 		view : {
   		/* Enables client side community moderation of Reflect bullets */
   		enable_rating : false,
   		/* If the bullet summaries have a picture of the listener. Note that this also requires
   		   the definition of Reflect.api.server.get_current_user_pic(), as well as having the 
   		   server return u_pic (a url to the user's pic) for each bullet. */
   		uses_profile_pic : false,
   		/* If the bullet summaries list the listener's name. */
   		uses_user_name : false,
   		/* Defines the icons to be used, relative path from Reflect.config.api.media_dir. */
   		images : {
   		  /* The image shown to the left of the prompt to add a new summary bullet point. 
   		     Will get scaled to ~30px. */
   		  bullet_prompt: 'listen.png',
   		  /* The image shown to the left of existing bullet points. Probably best if it looks 
   		     like a bullet in a bulleted list. Will get scaled to ~30px. */
   		  added_bullet: 'listen.png'
   		},  
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
   		  //response_prompt: 'Did {{LISTENER}} hear you accurately?'
   		  response_prompt: 'Is this an accurate summary?'
   		}
   				  
 		},
		
		study : false
	},

	/**
	* Contract implements methods for identifying key DOM elements, as well as modifying
	* the served DOM, that is necessary for wrapping Reflect elements around comments. 
	* 
	* This is the base class. Reflect implementations should replace Contract with 
	* a child class in reflect.{APPLICATION}.js.
	*/	
	Contract : Class.extend( {

		/* jquery selector or function for getting the logged in user */	
		user_name_selector : null,
		
		init : function ( config ) {
			this.components = config.components;
		},
		/* Function that is executed BEFORE the Reflect contract is enforced. 
		 * This is where the served DOM is whipped into shape (if it isn't already).*/
		modifier : function () {
		},
		/* Function executed AFTER the Reflect contract has been enforced.
		 */
		post_process : function () {
			
	  },
		/* Returns a jquery element representing the comment list.*/		
		get_comment_thread : function () {
		},
		/* Some applications need to add css in the client. Call _addStyleSheet if needed.*/		
		add_css : function () {
		},
		_addStyleSheet : function ( style ) {
			$j( 'head' ).append( '<style type="text/css">' + style + '</style>' );
		}
	} ),

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
		post_bullet : function () {
			
			var bullet_obj = $j.data( $j( this )
					.parents( '.bullet' )[0], 'bullet' ), 
				text = $j.trim(bullet_obj.elements.bullet_text.html()), 
				highlights = new Array(), 
				modify = bullet_obj.id;

			if ( !modify ) {
				bullet_obj.added_this_session = true
			}
			
			if (text.indexOf("<span class=") > -1) {
		 		text = text.substring(0, text.toLowerCase().indexOf("<span class="));
		 	}
			
			function add_highlights () {
				var el_id = $j( this ).attr( 'id' ).substring( 9 );
				highlights.push( {
					eid : el_id
				} );
			}
			bullet_obj.comment.elements.comment_text.find( '.highlight' )
					.each( add_highlights );

			var params = {
				comment_id : bullet_obj.comment.id,
				text : text,
				user : Reflect.utils.get_logged_in_user(),
				highlights : JSON.stringify( highlights ),
				this_session : bullet_obj.added_this_session
			};

			bullet_obj.options.highlights = highlights;
			if ( bullet_obj.id ) {
				params.bullet_id = bullet_obj.id;
				params.bullet_rev = bullet_obj.rev;
			}
			
			
			function post_bullet_callback ( data ) {
				if ( data ) {
					if ( !bullet_obj.id ) {
						bullet_obj.set_id( data.insert_id, data.rev_id );
					}
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
				error : function ( data ) {
				}
			} );
			Reflect.transitions.from_highlight( bullet_obj, false );
			Reflect.transitions.to_base( bullet_obj.comment.id );
		},
		
		post_delete_bullet : function ( bullet_obj ) {
			var params = {
				'delete' : true,
				comment_id : bullet_obj.comment.id,
				bullet_id : bullet_obj.id,
				bullet_rev : bullet_obj.rev,
				this_session : bullet_obj.added_this_session
			};
			var call = {
				params : params,
				success : function ( data ) {
				},
				error : function ( data ) {
				}
			};

			Reflect.api.server.post_bullet( call );

			bullet_obj.comment.elements.comment_text.find( '.highlight' )
					.removeClass( 'highlight' );
			bullet_obj.$elem.remove();		  
		},
		
		/* Ajax posting of a response to Reflect API. */				
		post_response : function ( response_obj ) {

			function ajax_callback ( data ) {
				var modify = response_obj.id;

				if ( data && !modify ) {
					response_obj.set_id( data.insert_id, data.rev_id );
				}

				if ( Reflect.config.study && !modify ) {
					/*Reflect.study.new_bullet_reaction_survey( 
							bullet_obj, bullet_obj.comment, 
							bullet_obj.$elem ); */
				}
			}
			var bullet_obj = response_obj.bullet, 
				text = response_obj.$elem
					.find( 'textarea.new_response_text' ).val(), 
				user = Reflect.utils.get_logged_in_user();

			if ( text.length == 0 ) {
				return;
			}
			
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
			var vals = {
				params : params,
				success : ajax_callback,
				error : function ( data ) {
				}
			};

			Reflect.api.server.post_response( vals );
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

			var vals = {
				success : function ( data ) {
				},
				error : function ( data ) {
				},
				params : params
			};

			Reflect.api.server.post_response( vals );		  
		},

		/* Ajax posting of a bullet rating to Reflect API. */				
		post_rating : function ( bullet_obj, rating, is_delete ) {

			var params = {
				bullet_id : bullet_obj.id,
				comment_id : bullet_obj.comment.id,
				bullet_rev : bullet_obj.rev,
				rating : rating,
				is_delete : is_delete
			},
			vals = {
				params : params,
				success : function ( data ) {},
				error : function ( data ) {}
			};

			Reflect.api.server.post_rating( vals );
		}		

	},

	/**
	* Methods for attaching event handlers to Bullets and Responses as they
	* move from state to state. 
	*/			
	bind : {
		/* Establishes default state for a bullet */
		bullet : function ( bullet_obj ) {

			bullet_obj.$elem
					.hover( Reflect.handle.bullet_mouseover, 
							Reflect.handle.bullet_mouseout );
        							            
			var footer = bullet_obj.elements.bullet_operations;
      
			footer
					.find( '.rate_bullet' )
					.hover( Reflect.handle.bullet_problem_mouseover, 
							Reflect.handle.bullet_problem_mouseout );

			footer
					.find( '.delete,.modify' )
					.hover( Reflect.handle.operation_mouseover, 
							Reflect.handle.operation_mouseout );

			footer
					.find( '.delete' )
					.bind( 'click', Reflect.handle.bullet_delete );

			footer.find( '.bullet_report_problem .flag' )
					.bind( 'click', Reflect.handle.bullet_flag );

			footer.css( {
				opacity : 0,
				display : 'none'
			} );

			// set modify bullet action
			if ( bullet_obj.user != 'Anonymous' && bullet_obj.user == Reflect.utils.get_logged_in_user() ) {
				// bullet_obj.elements.bullet_text
				//		.click( Reflect.transitions.to_bullet );
				footer.find( '.modify' )
						.click( Reflect.transitions.to_bullet );
			}
			bullet_obj.$elem.find( '.response' ).each( function () {
				var response_obj = $j.data( this, 'response' );
				if ( $j( this ).hasClass( 'new' ) ) {
					Reflect.bind.new_response( response_obj );
				} else {
					Reflect.bind.response( response_obj.bullet, response_obj );
				}
			} );
		},

		/* Establishes dialog state for a bullet */
		new_bullet : function ( bullet_obj ) {
			bullet_obj.$elem.find( '.bullet_submit' ).bind( 'click', {
				canceled : false,
				bullet_obj : bullet_obj
			}, function ( event ) {
			  if ( $(this).attr('disabled') != 'true') {
				  Reflect.transitions.from_bullet( event );
				  Reflect.transitions.to_highlight( event );
			  }
			} );

			bullet_obj.$elem.find( '.cancel_bullet' ).bind( 'click', {
				canceled : true,
				bullet_obj : bullet_obj
			}, Reflect.transitions.from_bullet );

			bullet_obj.comment.$elem.addClass( 'bullet_state' );

			var settings = {
				on_negative : Reflect.handle.negative_count,
				on_positive : Reflect.handle.positive_count,
				max_chars : 140
			}, text_area = bullet_obj.$elem.find( 'textarea' );

			var count_sel = '#rf_comment_wrapper-' + 
					bullet_obj.comment.id + ' .bullet.modify li.count';
			text_area.NobleCount(count_sel , settings );

			// wont work in Greasemonkey
			try {
				text_area.focus();
				//text_area.example(function() {
        //  return $(this).attr('title');
        //}, { className : 'jqueryexample' });
			} catch ( err ) {
			}

			cur_text = text_area.text();
			if ( !cur_text || cur_text.length == 0 ) {
				bullet_obj.elements.submit_button.attr( 'disabled', 'true' );
			}		  
		}, 
		
		/* Establishes default state for a response */
		response : function ( bullet_obj, response_obj ) {
			response_obj.$elem
					.hover( Reflect.handle.response_mouseover, 
							Reflect.handle.response_mouseout );

			response_obj.$elem
					.find( '.rate_bullet' )
					.hover( Reflect.handle.response_problem_mouseover, 
							Reflect.handle.response_problem_mouseout );

			response_obj.$elem
					.find( '.delete,.modify' )
					.hover( Reflect.handle.operation_mouseover, 
							Reflect.handle.operation_mouseout );

			response_obj.$elem.find( '.delete' )
					.bind( 'click', Reflect.handle.response_delete );

			response_obj.$elem.find( '.response_operations' ).css( {
				opacity : 0,
				display : 'none'
			} );

			var accurate_sel = 'input[name="accurate-' + response_obj.bullet.id + '"]';
			response_obj.$elem
					.find( accurate_sel )
					.click( Reflect.handle.accurate_clicked );

			if ( response_obj.user == Reflect.utils.get_logged_in_user() ) {
				//response_obj.$elem.find( '.rebutt_txt' )
				//		.click( Reflect.transitions.to_response );
				response_obj.$elem.find( '.modify' )
						.click( Reflect.transitions.to_response );
			}
		},
		
		/* Establishes dialog state for a response */
		new_response : function ( response_obj ) {
			response_obj.$elem.find( '.bullet_submit' ).bind( 'click', {
				canceled : false
			}, Reflect.transitions.from_response );

			response_obj.$elem.find( '.cancel_bullet' ).bind( 'click', {
				canceled : true
			}, Reflect.transitions.from_response );

			var settings = {
				on_negative : Reflect.handle.negative_count,
				on_positive : Reflect.handle.positive_count,
				max_chars : 140
			};

			var text_area = response_obj.$elem.find( 'textarea' ),
				count_sel = '#bullet-' 
					+ response_obj.bullet.id 
					+ ' .responses .new li.count';
			text_area.NobleCount( count_sel, settings );

			// wont work in GM
			try {
				text_area.focus();
				//text_area.example(function() {
        //  return $(this).attr('title');
        //}, 
				//  { className : 'jqueryexample' });
				
			} catch ( err ) {
			}

			response_obj.$elem
					.find( 'input[name=\'accurate-' + response_obj.bullet.id + '\']' )
					.click( Reflect.handle.accurate_clicked );
		}

	},

	/**
	* Boatload of event handlers. Naming convention is to have [noun]_[action|event].
	*/	
	handle : {
		bullet_delete : function ( event ) {
			var bullet_obj = $j.data( $j( this ).parents( '.bullet' )[0], 'bullet' ), 
				dialog = $j( '<div id="dialog-confirm">' );

			$j( dialog ).dialog( {
				resizable : false,
				height : 'auto',
				minHeight : 10,
				position : [ 'middle', 'center' ],
				modal : true,
				title : 'Do you really want to delete this bullet?',
				buttons : {
					'Yes' : function () {
						Reflect.api.post_delete_bullet( bullet_obj );
						$j( this ).dialog( 'close' );
					},
					'No' : function () {
						$j( this ).dialog( 'close' );
					}
				}
			} );
		},
    		
		bullet_mouseover : function ( event ) {

			var bullet_obj = $j
					.data( $j( this )[0], 'bullet' );

			if ( bullet_obj.comment.$elem.hasClass( 'highlight_state' )
					|| bullet_obj.comment.$elem.hasClass( 'bullet_state' ) ) {
				// if a different bullet is in highlight state, don't do anything...
				return;
			}

			var user = Reflect.utils.get_logged_in_user(), 
				footer = bullet_obj.elements.bullet_operations;

			var admin = Reflect.api.server.is_admin();

			if ( user != 'Anonymous' && user == bullet_obj.user && bullet_obj.responses.length == 0 ) {
				footer.find( '.modify_operation' ).show();
				footer.find( '.delete_operation' ).show();
				footer.find( '.rate_bullet' ).hide();
			} else if ( Reflect.api.server.is_admin() ) {
				footer.find( '.modify_operation' ).hide();
				footer.find( '.delete_operation' ).show();
				 Reflect.config.view.enable_rating ? 
					footer.find('.rate_bullet').show() :
					footer.find('.rate_bullet').hide();
			} else if ( user == 'Anonymous' && user == bullet_obj.user && bullet_obj.added_this_session ) {
				footer.find( '.modify_operation' ).hide();
				footer.find( '.delete_operation' ).show();
				 Reflect.config.view.enable_rating ?
					footer.find('.rate_bullet').show() :
					footer.find('.rate_bullet').hide();
			} else {
				footer.find( '.modify_operation' ).hide();
				footer.find( '.delete_operation' ).hide();
				 Reflect.config.view.enable_rating && user != bullet_obj.user && user != bullet_obj.comment.user ?
					footer.find('.rate_bullet').show() :
					footer.find('.rate_bullet').hide();
			}

			footer.animate( {
				opacity : 1
			}, 800 ).show();
      
			for ( var h in bullet_obj.highlights) {
				bullet_obj.comment.elements.comment_text
						.find( '#sentence-' + bullet_obj.highlights[h].eid )
						.addClass( 'highlight' );
			}

		},
    
		bullet_mouseout : function ( event ) {
			var bullet_obj = $j
					.data( $j( this ), 'bullet' );
		  
			var comment = $j( this ).parents( '.rf_comment_wrapper' );
			if ( comment.hasClass( 'highlight_state' )
					|| comment.hasClass( 'bullet_state' ) ) {
				// if a different bullet is in highlight state, don't do anything...
				return;
			}

			$j( this ).find( '.bullet_operations' ).animate( {
				opacity : 0
			}, 300, function () {
			} );

			$j( this ).find( '.bullet_operations' ).hide();

			comment.find( '.highlight' ).removeClass( 'highlight' );
		},

		bullet_problem_mouseover : function ( event ) {
			$j( this ).find( '.bullet_report_problem' ).show();
			$j( this ).find( '.bullet_report_problem' ).animate( {
				opacity : 1
			}, 300 );
		},

		bullet_problem_mouseout : function ( event ) {
			$j( this ).find( '.bullet_report_problem' ).animate( {
				opacity : 0
			}, 300 );
			$j( this ).find( '.bullet_report_problem' ).hide();			
		},

		bullet_flag : function ( event ) {
			var bullet_obj = $j.data( $j( this ).parents( '.bullet' )[0], 'bullet' ),
				flags = bullet_obj.flags,
				flag = $j( this ).attr( 'name' );

			if ( flags[flag] && flags[flag] > 0 ) {
				flags[flag] = -1;
			} else {
				flags[flag] = 1;
			}
			Reflect.api.post_rating( bullet_obj, flag, flags[flag] < 0 );

		},
		operation_mouseover : function ( event ) {
		},

		operation_mouseout : function ( event ) {
		},

		response_delete : function ( event ) {
			var response_obj = $j.data( $j( this )
					.parents( '.response' )[0], 'response' );
      Reflect.api.post_delete_response( response_obj );
			response_obj.response_delete();
			Reflect.bind.new_response( response_obj );      
		},

		response_mouseover : function ( event ) {
			var response_obj = $j.data( this, 'response' ), 
				user = Reflect.utils.get_logged_in_user();
      if ( user != response_obj.user ) {
        return;
      } 
      response_obj.$elem.find( '.response_operations' ).show()
					.animate( {
						opacity : 1
					}, 300 );
		},

		response_mouseout : function ( event ) {
			var footer_wrapper = $j( this ).find( '.response_operations' );
			footer_wrapper.animate( {
				opacity : 0
			}, 300, function () {
			} );
			footer_wrapper.hide();
		},

		response_problem_mouseover : function ( event ) {
			$j( this ).find( '.bullet_report_problem' ).show();
			$j( this ).find( '.bullet_report_problem' ).animate( {
				opacity : 1
			}, 300 );
			$j( this ).find( 'img.hover' ).css( 'display', 'inline' );
			$j( this ).find( 'img.base' ).hide();
		},

		response_problem_mouseout : function ( event ) {
			$j( this ).find( '.bullet_report_problem' ).animate( {
				opacity : 0
			}, 300 );
			$j( this ).find( 'img.hover' ).hide();
			$j( this ).find( 'img.base' ).css( 'display', 'inline' );
		},

		comment_mouseover : function ( event ) {
		},
		comment_mouseout : function ( event ) {
		},

		negative_count : function ( t_obj, char_area, c_settings, char_rem ) {
			if ( !char_area.hasClass( 'too_many_chars' ) ) {
				char_area.addClass( 'too_many_chars' ).css( {
					'font-weight' : 'bold',
					'font-size' : '200%'
				} );

				t_obj.parents( '.new_bullet_wrapper' ).find( '.bullet_submit' )
						.animate( {
							opacity : .25,
							duration : 50
						} ).attr( 'disabled', true ).css( 'cursor', 'default' );
				t_obj.data( 'disabled', true );

			}
		},
		positive_count : function ( t_obj, char_area, c_settings, char_rem ) {
			if ( char_area.hasClass( 'too_many_chars' ) ) {
				char_area.removeClass( 'too_many_chars' ).css( {
					'font-weight' : 'normal',
					'font-size' : '125%'
				} );

				t_obj.parents( '.new_bullet_wrapper' ).find( '.bullet_submit' )
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
			var parent = $j( this ).parents( '.rf_comment' ), 
				comment = $j.data( parent[0], 'comment' );

			if ( parent.hasClass( 'highlight_state' ) ) {
				var bullet = parent.find( '.connect_directions' )
						.parents( '.bullet' ).data( 'bullet' ), 
					submit = bullet.elements.submit_button;
				if ( submit.length == 0 ) {
					submit = parent.find( '.bullet.modify .bullet_submit' );
				}

				if ( $j( this ).hasClass( 'highlight' ) ) {
					$j( this ).removeClass( 'highlight' );
					if ( parent.find( '.rf_comment_text .highlight' ).length == 0 ) {
						submit.attr( 'disabled', true );
					}
				} else {
					$j( this ).addClass( 'highlight' );
					if ( submit.attr( 'disabled' ) == true ) {
						submit.attr( 'disabled', false );
					}
				}
			}
		},

		accurate_clicked : function () {
			var response_obj = $j.data( $j( this )
					.parents( '.response' )[0], 'response' );

			response_obj.$elem.find( '.response_dialog' ).slideDown('slow',
			  function(){ $(this).find('textarea').focus();});
			response_obj.$elem.find( '.submit .bullet_submit' ).removeAttr( 'disabled' );
		},
		toggle_bullets_pagination : function ( event ) {
		  $j( this ).parents('.summary').find('.bullet_list').children().fadeIn();
		  $j( this ).hide();		  
 		}		

	},

	/**
	* Collection of methods for transitioning Bullets and Responses to / from 
	* different states. 
	* 
	* Bullets can be in dialog state (bullet), highlight state, and base state. 
	* Responses can be in dialog state and base state. 
	*/		
	transitions : {
		to_base : function ( comment_id ) {
			var comment = $j.data( $j( '#summary-' + comment_id )
					.parents( '.rf_comment' )[0], 'comment' ), 
				logged_in_user = Reflect.utils.get_logged_in_user();

			if ( comment.user == logged_in_user ) {
				return;
			}

			if ( comment.elements.bullet_list.find( '.new_bullet' ).length == 0 ) {
				var new_bullet = comment.add_bullet_prompt();
				new_bullet.$elem.find( '.add_bullet' )
						.bind( 'click', Reflect.transitions.to_bullet, false );
			}
		},

		to_bullet : function () {
			var bullet_obj = $j.data( $j( this )
					.parents( '.bullet' )[0], 'bullet' );

			bullet_obj.enter_edit_state();
			Reflect.bind.new_bullet( bullet_obj );
		},

		from_bullet : function ( event ) {
			var canceled = event.data.canceled, 
				bullet_obj = event.data.bullet_obj;

			bullet_obj.comment.$elem.removeClass( 'bullet_state' );

			var params = {};
			if ( !canceled ) {
				params = {
					bullet_text : bullet_obj.elements.new_bullet_text.val(),
					user : Reflect.utils.get_logged_in_user()
				};
				if ( params.bullet_text.length == 0 ) {
					return;
				}
			}

			bullet_obj.exit_edit_state( params, canceled );

			if ( !canceled && !bullet_obj.id ) {
				/*bullet_obj.elements.bullet_main.animate( {
					backgroundColor : '#FFFFaa'
				}, {
					duration : 1000
				} );*/
			} else if ( canceled && !bullet_obj.id ) {
				bullet_obj.$elem.find( '.add_bullet' )
						.bind( 'click', Reflect.transitions.to_bullet, false );
			} else if ( canceled && bullet_obj.id ) {
				Reflect.bind.bullet( bullet_obj );
			}

		},

		to_highlight : function ( event ) {
			var bullet_obj = event.data.bullet_obj;

			bullet_obj.comment.$elem.addClass( 'highlight_state' );

			var highlight = bullet_obj.enter_highlight_state();

			highlight.find( 'td:first' ).addClass( 'connect_directions' );

			bullet_obj.elements.submit_button
					.bind( 'click', Reflect.api.post_bullet );

			highlight.find( '.cancel_bullet' ).bind( 'click', function () {
				Reflect.transitions.from_highlight( bullet_obj, true );
			} ).bind( 'click', function () {
				Reflect.transitions.to_base( bullet_obj.comment.id );
			} );

			if ( bullet_obj.comment.elements.comment_text.find( '.highlight' ).length == 0 ) {
				bullet_obj.elements.submit_button.attr( 'disabled', true );
			}
		},
		from_highlight : function ( bullet_obj, canceled ) {
			var comment = bullet_obj.comment, 
				modified = bullet_obj.id;

			comment.$elem.removeClass( 'highlight_state' );

			bullet_obj.exit_highlight_state( canceled );
			if ( !canceled ) {
				Reflect.bind.bullet( bullet_obj );

				/*var bullet_main = bullet_obj.elements.bullet_main,
					bg = Reflect.utils.get_background_color( bullet_main );
				bullet_main.animate( {
					backgroundColor : bg
				}, {
					duration : 1500,
					complete : function () {
						$j( this ).removeAttr( 'style' );
					}
				} );*/

			} else if ( modified ) {
				Reflect.bind.bullet( bullet_obj );
			} else {
				bullet_obj.$elem.find( '.add_bullet' )
						.bind( 'click', Reflect.transitions.to_bullet, false );
			}

		},

		to_response : function () {
			var response_obj = $j.data( $j( this )
					.parents( '.response' )[0], 'response' );
			response_obj.enter_edit_state();
			Reflect.bind.new_response( response_obj );
		},

		from_response : function ( event ) {
			var response_obj = $j.data( $j( this )
					.parents( '.response' )[0], 'response' ), 
				bullet_obj = response_obj.bullet, 
				canceled = event.data.canceled;

			params = {
				media_dir : Reflect.api.server.media_dir,
				user : Reflect.utils.get_logged_in_user()
			};

			if ( !canceled ) {
				var accurate_sel = "input[name='accurate-" + 
					response_obj.bullet.id + "']:checked";
				params.text = response_obj.elements.new_response_text.hasClass('jqueryexample') ? '' : response_obj.elements.new_response_text.val();
				params.sig = response_obj.$elem.find( accurate_sel ).val();
				Reflect.api.post_response( response_obj );
			}
			response_obj.exit_dialog( params, canceled );

			if ( !canceled || response_obj.id ) {
				Reflect.bind.response( bullet_obj, response_obj );
			} else {
				Reflect.bind.new_response( response_obj );
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
		
		get_logged_in_user : function () {
			if ( typeof Reflect.current_user == 'undefined' ) {
				//jquery.text escapes the html
				Reflect.current_user = $j( '#rf_user_name' ).text();
			}
			return Reflect.current_user;
		},

		get_background_color : function ( node, no_convert ) {
			var col = $j.getColor(node[0], 'background-color');
			if ( !no_convert ) {
				var new_col = "#";
				for ( var i = 0; i <= 2; ++i) {
					var new_color = col[i].toString( 16 );
					if ( new_color.length == 1 ) {
						new_color = '0' + new_color;
					}
					new_col += new_color;
				}
				col = new_col;
			}
			return col
		},

		get_inverted_background_color : function ( node, color_convert ) {
			try {
				var rgbString = Reflect.utils.get_background_color( node, true ),
					res = '#';
				
				for ( var i = 0; i <= 2; ++i) {
					var new_color = color_convert( rgbString[i] )
									.toString( 16 );
					if ( new_color.length == 1 ) {
						new_color = '0' + new_color;
					}
					res += new_color;
				}
				return res;
			} catch ( err ) {
				return '#555';
			}
		},
		
		
		
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

				this.elem = elem;
				this.$elem = $j( elem );
				this.elements = {};

				this.id = this.$elem.attr( 'id' )
						.substring( this.options.initializer.comment_offset );
			
				this.user = this.options.initializer.get_commenter_name( this.id );
				if ( this.user == '' || this.user == null || this.user == 'Anonymous coward' ) {
					this.user = 'Anonymous';
				}
				if ( this.user.indexOf( ' ' ) > -1 ) {
					this.user_short = this.user.split( ' ' )[0];
				} else {
					this.user_short = this.user;
				}

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
						+ '<div class="reflect_header"><span>Readers hear ' + this.user + ' saying...</span></div>'
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
				
				comment_text.before('<a class="rf_toggle state_on">[hide summaries]</a>');
				
				//so that we don't try to break apart urls into different sentences...
				comment_text.find('a')
				  .addClass('exclude_from_reflect')
          .click(function(e){
  				  if ($(this).parents('.rf_comment').hasClass('highlight_state')) {
  				    e.preventDefault();
  				  }
  				});				  
        
        this.$elem
          .find( '.rf_toggle' )
          .click( function() {
            if ( $(this).hasClass('state_on') ) {
              $('.rf_comment_summary').hide();
              $('.rf_comment_text_wrapper').css('width', '100%');
              $('.rf_toggle').addClass('state_off').removeClass('state_on');
              $('.rf_toggle').text("[show summaries]");              
            } else {
              $('.rf_comment_summary').show();
              $('.rf_comment_text_wrapper').css('width', 'inherit');
              $('.rf_toggle').addClass('state_on').removeClass('state_off');
              $('.rf_toggle').text("[hide summaries]");              
            }
          });
          
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
				var bullet_text = bullet_info.txt, 
					bullet_id = bullet_info.id, 
					responses = '';
				if(!bullet_info.u_pic){
					bullet_info.u_pic = null;
				}
				var params = {
					is_prompt : false,
					user : bullet_info.u,
					bullet_text : bullet_text,
					bullet_id : bullet_id,
					bullet_rev : bullet_info.rev,
					commenter : this.user,
					responses : responses,
					comment : this,
					highlights : bullet_info.highlights,
					listener_pic : bullet_info.u_pic
				};
				return this._add_bullet( params );
			},
			add_bullet_prompt : function () {
				params = {
					is_prompt : true,
					commenter : this.user_short,
					comment : this
				};

				var bullet_obj = this._add_bullet( params );
				return bullet_obj;
			},
			clear_text : function () {
				this.elements.text_wrapper.unbind().find( '.highlight' )
						.removeClass( 'highlight' );
			},
			hide_excessive_bullets : function() {
			  if ( this.bullets.length > 1 && this.elements.bullet_list.height() + 70 > this.elements.comment_text.height() ) {
			    var i = this.bullets.length - 1;
			    while (  i > 0 && this.elements.bullet_list.height() + 70 > this.elements.comment_text.height() ) {
			      this.bullets[i].$elem.hide();
			      i -= 1;
			    }
			    this.$elem.find('.reflect_header').append('<a class="rf_toggle_paginate">show all</a>');
			    this.$elem.find('.rf_toggle_paginate').bind (
			      "click", Reflect.handle.toggle_bullets_pagination
			    );
			    this.elements.summary.css('padding-top', parseInt(this.elements.summary.css('padding-top')) - 20);
			  }
 			}			

		},

		Bullet : {
			init : function ( options, elem ) {
				this.options = $j.extend( {}, this.options, options );
				this.options.media_dir = Reflect.api.server.media_dir;

				// Save the element reference, both as a jQuery
				// reference and a normal reference
				this.elem = elem;
				this.$elem = $j( elem );
				this.elements = {};

				this.set_attributes();
				this.responses = [];
				this.flags = {};

				// Build the dom initial structure
				if ( this.options.is_prompt ) {
					this._build_prompt();
				} else {
					this._build();
				}
				return this;

			},
			set_attributes : function () {
				if ( !this.id ) {
					this.id = this.options.bullet_id;
					this.rev = this.options.bullet_rev;
				}
				if ( !this.user ) {
					this.user = this.options.user;
				}
				if ( !this.comment ) {
					this.comment = this.options.comment;
				}
				this.highlights = this.options.highlights;
			},
			options : {},
			_build : function () {
				var template_vars = {
					bullet_text : Reflect.utils.escape( this.options.bullet_text ),
					bullet_image : Reflect.config.view.images.added_bullet,
					user : Reflect.utils.escape( this.options.user ),
					media_dir : Reflect.config.api.media_dir,
					commenter : Reflect.utils.escape( this.options.commenter ),
					listener_pic : this.options.listener_pic,
					uses_profile_pic : Reflect.config.view.uses_profile_pic,
					uses_user_name : Reflect.config.view.uses_user_name,
					id : this.id
				}; 	
				this.$elem
						.addClass( 'bullet' )
						.html( $j.jqote( Reflect.templates.bullet, template_vars ) );
				
				if ( this.user == Reflect.utils.get_logged_in_user() ) {
				  this.$elem
				    .addClass( 'self' );
				}

				if ( this.id ) {
					this.set_id( this.id, this.rev );
					this.$elem.addClass( 'full_bullet' )
				}

				this.elements = {
					response_list : this.$elem.find( '.responses ul' ),
					bullet_text : this.$elem.find( '.bullet_text' ),
					bullet_main : this.$elem.find( '.bullet_main' ),
					bullet_operations : this.$elem
							.find( '.bullet_operations' )
				};
			},
			_build_prompt : function () {
			  var commenter = Reflect.utils.escape( this.options.commenter );
				var template_vars = {
					commenter : commenter,
					media_dir : Reflect.config.api.media_dir,
					bullet_prompt : Reflect.config.view.text.bullet_prompt.replace('{{COMMENTER}}', commenter),
					bullet_prompt_image : Reflect.config.view.images.bullet_prompt
				};
				
				var template = Reflect.templates.new_bullet_prompt;
				
				this.$elem
						.addClass( 'bullet' )
						.addClass( 'new_bullet' )
						.html( $j.jqote( template, template_vars ) );
						/*.css( {
							'background' : 'url(' 
								+ Reflect.api.server.media_dir 
								+ 'small_listener.png) left top no-repeat'
						} ); */
						
				this.elements = {};
			},
			set_id : function ( id, rev ) {
				this.id = parseInt(id);
				this.rev = parseInt(rev);
				this.$elem.attr( 'id', 'bullet-' + this.id );
			},
			enter_edit_state : function () {
				var text = '', 
					modify = this.id;

				if ( modify ) {
					text = $j.trim(this.elements.bullet_text.html());
					if ( text.indexOf( "<span class=" ) > -1 ) {
						text =  text.substring( 0, text
								.toLowerCase()
								.indexOf( "<span class=" ) );
					}
				}

				var template_vars = {
					media_dir : Reflect.api.server.media_dir,
					bullet_id : this.id,
					txt : Reflect.utils.escape( text ),
					commenter : this.comment.user_short,
					bullet_prompt_image : Reflect.config.view.images.bullet_prompt					
				};
				this.$elem.addClass( 'modify' ).unbind( 'click' )
					.unbind( 'mouseover' ).unbind( 'mouseout' )
					.html( 
						$j.jqote( Reflect.templates.new_bullet_dialog, template_vars ) );
					/*.css( {
							'background' : 'url(' 
								+ Reflect.api.server.media_dir 
								+ 'small_listener_trans.png) left top no-repeat'
						} ); */

				this.elements = {
					new_bullet_text : this.$elem.find( '.new_bullet_text' ),
					bullet_text : this.$elem.find( '.bullet_text' ),
					submit_button : this.$elem.find( '.submit .bullet_submit' )
				};

			},
			exit_edit_state : function ( params, canceled ) {
				this.$elem.removeClass( 'modify' );
				if ( canceled && !this.id ) {
					this._build_prompt();
				} else {
					this.options = $j.extend( {listener_pic:Reflect.api.server.get_current_user_pic()}, this.options, params );
					
					this.set_attributes();
					this._build();
				}
			},
			enter_highlight_state : function () {
				var highlight = $j( '<table />' ).addClass( 'new_bullet_wrapper' )
						.html( $j.jqote( Reflect.templates.bullet_highlight, {
							media_dir : Reflect.api.server.media_dir
						} ) );

				this.$elem.addClass('connect');
				
				var wrapper = this.$elem.find('.bullet_main_wrapper');
				var child = $j('<li />').addClass('bullet_dialog').append(highlight);
				wrapper.append( child );
				this.elements.submit_button = this.$elem.find( '.submit .bullet_submit' );
				return highlight;

			},
			exit_highlight_state : function ( canceled ) {
				if ( canceled && !this.id ) {
					this.$elem
						.removeClass( 'modify' )
						.removeClass( 'connect' );
					this._build_prompt();
				} else {
					this.$elem
						.removeClass( 'new_bullet' )
						.addClass( 'full_bullet' );
					var me = this;
					this.$elem.find( '.new_bullet_wrapper' ).fadeOut(200, function(){
						me.$elem
							.removeClass( 'modify' )
							.removeClass( 'connect' );
												
						
					});
					me.set_attributes();
				}
				this.comment.clear_text();
			},
			_add_response : function ( params ) {
				var response = $j( '<li />' ).response( params );
				this.elements.response_list.append( response );
				this.responses.push( response );
				return $j.data( response[0], 'response' );
			},
			add_response : function ( response_info ) {
				var params = {
					media_dir : Reflect.api.server.media_dir,
					user : response_info.u,
					text : response_info.txt,
					id : response_info.id,
					rev : response_info.response_rev,
					sig : response_info.sig,
					is_prompt : false,
					bullet : this
				};
				return this._add_response( params );
			},
			add_response_dialog : function () {
				var params = {
					media_dir : Reflect.api.server.media_dir,
					is_prompt : true,
					bullet : this
				};
				return this._add_response( params );
			},
			remove_response_section : function() {
				this.elements.response_list.parent().remove();
			},
			set_flag : function () {

			}

		},

		Response : {
			init : function ( options, elem ) {
				this.options = $j.extend( {}, this.options, options );

				this.elem = elem;
				this.$elem = $j( elem );

				this.set_attributes();
				this.elements = {};

				if ( this.options.is_prompt ) {
					this._build_prompt();
				} else {
					this._build();
				}

				return this;

			},
			options : {},
			set_attributes : function () {
				this.id = parseInt(this.options.id);
				this.rev = parseInt(this.options.rev);
				this.bullet = this.options.bullet;
				this.user = this.options.user;
			},
			_build : function () {
				var first_name = this.options.user;
				if (first_name.indexOf(' ') > -1){
					first_name = first_name.substring(0, first_name.indexOf(' '));
				}
				var template_vars = {
						text : Reflect.utils.escape( this.options.text ),
						sig : Reflect.utils.escape( String(this.options.sig) ),
						user : Reflect.utils.escape( first_name ),
						media_dir : Reflect.api.server.media_dir
					};
				this.$elem
						.addClass( 'response' )
						.addClass('accurate_'+{"1":'somewhat',"2":'yes',"0":'no'}[this.options.sig]).html( 
						$j.jqote( Reflect.templates.response, template_vars ) );
						
				if ( this.user == Reflect.utils.get_logged_in_user() ) {
				  this.$elem
				    .addClass( 'self' );
				}
    										
				if ( this.id ) {
					this.set_id( this.id, this.rev );
				}

				this.elements = {
					response_text : this.$elem.find( '.rebutt_txt' )
				};

			},
			_build_prompt : function () {
				var template_vars = {
						bullet_id : this.bullet.id,
						text : Reflect.utils.escape( this.options.text ),
						sig : Reflect.utils.escape( String(this.options.sig) ),
						user : Reflect.utils.escape( this.options.user ),
						media_dir : Reflect.api.server.media_dir, 
						summarizer : this.bullet.user,
						response_prompt : Reflect.config.view.text.response_prompt.replace('{{LISTENER}}', this.bullet.user)						
					};
				this.$elem.addClass( 'response' ).addClass( 'new' ).html( 
						$j.jqote( Reflect.templates.response_dialog, template_vars ) );
				this.elements = {
					new_response_text : this.$elem.find( '.new_response_text' )
				};

			},
			set_id : function ( id, rev ) {
				this.id = id;
				this.rev = rev;
				this.$elem.attr( 'id', 'response-' + this.id );
			},
			exit_dialog : function ( params, canceled ) {
				this.options = $j.extend( {}, this.options, params );
				if ( !canceled || this.id ) {
					this._build();
					this.set_attributes();
					this.$elem.removeClass('new');
				} else if ( canceled ) {
					this._build_prompt();
				}
			},
			enter_edit_state : function () {
				var modify = this.id;

				if ( modify ) {
					var text = this.elements.response_text.html(), split = text.indexOf( '</span>');
					if ( split > -1 ) {
					  this.options.text = $j.trim( text.substring( split + 7, text.length ) );
					} else {
					  this.options.text = '';
					}
					
				}

				this._build_prompt();

				this.elements = {
					new_response_text : this.$elem.find( '.new_response_text' ),
					submit_button : this.$elem.find( '.submit .bullet_submit' )
				};

			},
			response_delete : function () {
				this.options.text = null;
				this.options.sig = null;
				this.options.id = null;
				this.set_attributes();
				this._build_prompt();
			}
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
				response_dialog : $j.jqotec( '#reflect_template_response_prompt' )
			} );
		}
	},
	
	/**
	* Take the current DOM and wrap Reflect elements where appropriated, guided
	* by the Reflect.contract. 
	*/		
	enforce_contract : function () {
		$j( Reflect.contract.get_comment_thread() )
				.wrapInner( '<div id=reflected />' );

		var user = null;
		if ( Reflect.contract.user_name_selector ) {
		  	if ( typeof Reflect.contract.user_name_selector == 'function' ) {
		  		user = $j(Reflect.contract.user_name_selector()).text();
		  	}
		  	else {
		  		user = $j(Reflect.contract.user_name_selector).text();
		  	}
	   }
		if ( !user || user == '' || user == null || user == 'undefined' ) {
			user = Reflect.api.server.get_current_user();
		}
		
		var user_el = '<span id="rf_user_name" style="display:none">' + user + '</span>';
		$j( '#reflected' ).append( user_el );

		for (i = 0; i < Reflect.contract.components.length; i++) {
			var component = Reflect.contract.components[i];

			$j( component.comment_identifier )
				.each( function ( index ) {
					var params = {
						initializer : component
					};
					$j( this ).comment( params );
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
								a_tot += parseFloat(a.highlights[j].eid);
							}
					 		for ( var j in b.highlights) {
								b_tot += parseFloat( b.highlights[j].eid );
							}
							var a_score = a_tot / a.highlights.length,
								b_score = b_tot / b.highlights.length;
							return a_score - b_score;
						} );

						$j.each(bullets, function(key, bullet_info) {

							var bullet = comment.add_bullet( bullet_info ), 
								responses = bullet_info.responses, 
								has_response = false;

							for ( var k in responses) {
								has_response = true;
								break;
							}

							if ( has_response ) {
								for ( var k in responses) {
									var response_obj = bullet
											.add_response( responses[k] );
								}
							} else if ( comment.user == user ) {
								bullet.add_response_dialog();
							} else {
								bullet.remove_response_section();
							}

							Reflect.bind.bullet( bullet );

						});
            comment.hide_excessive_bullets();
					}
					
					// segment sentences we can index them during highlighting
					comment.elements.comment_text.wrap_sentences();
					comment.elements.comment_text.find( '.sentence' )
							.each( function ( index ) {
								$j( this ).attr( 'id', 'sentence-' + index )
										.click( Reflect.handle.sentence_click );
							} );
												
					Reflect.transitions.to_base( comment.id );

				} );
		}
	},
	
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
	    // this is currently untested...
	    get_templates_callback( $j('#reflect_templates_present').html() );
	  } else {
	    // if it hasn't been tested, fetch templates from server
  		Reflect.api.server.get_templates(
  			get_templates_callback );	    
	  }	

	}
};

$j( document ).ready( function () {
	$j.ajaxSetup({ cache: false });

	Reflect.init();
} );

})(jQuery);
