/*
 * 
 * Heavily modified version of Bartek Szopka's jQuery Highlight (http://bartaz.github.com/sandbox.js/jquery.highlight.html)
 * Copyright (c) 2009 Bartek Szopka. Adapted by Travis Kriplean for Reflect.
 *
 * Licensed under MIT license.
 *
 */

RegExp.escape = function(str){
	var specials = new RegExp("[.*+?|()\\[\\]{}\\\\]", "g"); // .*+?|()[]{}\
	return str.replace(specials, "\\$&");
};

jQuery.extend({
    _wrap_sentences: function (node, re, nodeName, className) {
        if (!node ){ return 0;}

        if (node.nodeType === 3) {
            var match = node.data.match(re);
            if (match) {
	            var wordNode = node.splitText(match.index);
	            wordNode.splitText(match[0].length);
    				} else if(jQuery.trim(node.nodeValue).length == 0){
    					return 0;
    				} else{
    	          var wordNode = node.splitText(0);
            }
			
            var highlight = document.createElement(nodeName || 'span');
            highlight.className = className;
            
            var wordClone = wordNode.cloneNode(true);
            highlight.appendChild(wordClone);
            wordNode.parentNode.replaceChild(highlight, wordNode);			
			
            return 1; //skip added node in parent
            
        } else if ((node.nodeType === 1 && node.childNodes) && // only element nodes that have children
                !/(script|style)/i.test(node.tagName) && // ignore script and style nodes
                !(node.className === className)) { // skip if already highlighted
            for (var i = 0; i < node.childNodes.length; i++) {
               i += jQuery._wrap_sentences(node.childNodes[i], re, nodeName, className);
            }
        }
        return 0;

    }
});

jQuery.fn.wrap_sentences = function (words, options) {
    var settings = { className: 'sentence', element: 'span', 
                     caseSensitive: false, wordsOnly: false };
    jQuery.extend(settings, options);
    
    var pattern = "[^\.\?!]+[\.\?!]";
	
    var re = new RegExp(pattern);
    re.escape;
    return jQuery._wrap_sentences(this[0], re, settings.element, settings.className);
};