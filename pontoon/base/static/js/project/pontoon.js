(function () {

  var Pontoon = {
        app: {
          win: window.top,
          path: ""
        },
        project: {
          win: window,
          url: window.location.href,
          title: "",
          info: null,
          pages: [],
          page: 0
        },
        locale: {
          code: "",
          language: ""
        },
        user: {
          name: "",
          email: ""
        },
        transifex: {
          username: "",
          password: "",
          project: "",
          resource: ""
        }
  	  },
      jqueryAppended = false,
      script = document.createElement('script');

  // Main code
  function jqueryLoaded() {
    $(function() {



      /**
       * Send data to main Pontoon code
       */
      function sendData() {
        // Deep copy: http://api.jquery.com/jQuery.extend
        var pages = $.extend(true, {}, Pontoon.project.pages);
        $(pages[Pontoon.project.page].entities).each(function () {
          delete this.node;
        });

        postMessage("DATA", {
          page: Pontoon.project.page,
          url: Pontoon.project.url,
          title: Pontoon.project.title,
          info: Pontoon.project.info,
          pages: pages,
          username: Pontoon.transifex.username,
          password: Pontoon.transifex.password,
          name: Pontoon.transifex.project,
          resource: Pontoon.transifex.resource
        });
      }



      /**
       * Render main UI and handle events
       */
      function renderHandle() {
        sendData();
        postMessage("RENDER");

        // Update UI and progress when saved
        $(".editableToolbar > .save").click(function () {
          var element = $(this).parent().get(0).target,
              entity = element.entity;

          entity.translation = $($(element).clone()).html();
          sendData();
          postMessage("SAVE", entity.id);
        });

        // Do not change anything when cancelled
        $(".editableToolbar > .cancel").click(function () {
          var element = $(this).parent().get(0).target,
              entity = element.entity;

          $(element).html(entity.translation || entity.original);
        });

        // In-place keyboard shortcuts
        $("html").unbind("keydown.pontoon").bind("keydown.pontoon", function (e) {
          var key = e.keyCode || e.which,
              toolbar = $(".editableToolbar"),
              save = toolbar.find(".save"),
              cancel = toolbar.find(".cancel"),
              target = toolbar.get(0).target,
              entity = target.entity,
              id = entity.id,
              next = id + 1,
              entities = Pontoon.project.pages[Pontoon.project.page].entities;

          if (save.is(":visible")) {
            if (key === 13) { // Enter: confirm translation
              save.click();
              target.hideToolbar();
              return false;
            }

            if (key === 27) { // Esc: status quo
              cancel.click();
              target.hideToolbar();
              return false;
            }

            if (key === 9) { // Tab: status quo + move around entities
              // If on last entity, jump to the first
              if (next > entities.length) {
              	$.each(entities, function() {
                  if (this.body) {
                    next = this.id;
                  }
                });
              }
              cancel.click();
              $(target).removeClass("hovered");
              postMessage("HOVER", id);
              entities[next].hover();
              $(".editableToolbar > .edit").click();
              return false;
            }
          }
        });
      }



      /**
       * Extend entity object
       * 
       * e Temporary entity object
       */
      function extendEntity(e) {
        e.hover = function () {
          this.node.get(0).showToolbar();
        };
        e.unhover = function () {
          this.node.get(0).hideToolbar();
        };
      }



      /**
       * Makes DOM nodes editable using contentEditable property
       * Based on editableText plugin by Andris Valums, http://valums.com
       *
       * node DOM node
       */ 
      function makeEditable(node) {
        // Show/hide toolbar
        node.showToolbar = function () {
          showToolbar(this);
        }
        node.hideToolbar = function () {
          hideToolbar(this);
        }

        // Hover handler
        $(node).hover(function () {
          this.entity.hover();
        }, function() {
          this.entity.unhover();
        });
      }



      /**
       * Extract entities from the document, not prepared for working with Pontoon
       * 
       * Create entity object from every non-empty text node
       * Exclude nodes from special tags (e.g. <script>) and with translate=no attribute
       * Skip nodes already included in parent nodes
       * Add temporary pontoon-entity class to prevent duplicate entities when guessing
       */ 
      function guessEntities() {
        Pontoon.project.pages = [{
          title: Pontoon.project.title,
          url: Pontoon.project.url,
          entities: []
        }];
        var counter = 0;

        // <noscript> contents are not in the DOM
        $('noscript').each(function() {
          $("<div/>", {
          	class: "pontoon-noscript",
            innerHTML: $(this).text()
          }).appendTo("body");
        });

        $(':not("script, style, iframe, noscript, [translate=\"no\"]")').contents().each(function () {
          if (this.nodeType === Node.TEXT_NODE && $.trim(this.nodeValue).length > 0 && $(this).parents(".pontoon-entity").length === 0) {
            var entity = {},
                parent = $(this).parent();
            entity.id = counter;
            counter++;
            entity.original = parent.html();

            // Head entities cannot be edited in-place
            if ($(this).parents('head').length === 0) {
              entity.node = parent; // HTML Element holding string
              entity.body = true;
              makeEditable(entity.node.get(0)); // Make nodes editable
              entity.node.get(0).entity = entity; // Store entity reference to the node
              extendEntity(entity);
            }

            // Remove entities from child nodes if parent node is entity
            // TODO: do we need this now that we have additional check in the top-level IF?
            // Also: pop() removes the last element from the array
            parent.find(".pontoon-entity").each(function() {
              Pontoon.project.pages[Pontoon.project.page].entities.pop(this.entity);
              entity.id--;
              counter--;
            });

            Pontoon.project.pages[Pontoon.project.page].entities.push(entity);
            parent.addClass("pontoon-entity");
          }
        });

        $(".pontoon-entity").removeClass("pontoon-entity");
        $(".pontoon-noscript").remove();
        renderHandle();
      }



      /**
       * Load data from Transifex: original string, translation, comment, suggestions...
       * Match with each string in the document, which is prepended with l10n comment nodes
       * Example: <!--l10n-->Hello World
       *
       * Create entity objects
       * Remove comment nodes
       */
      function loadEntities() {
        Pontoon.project.pages = [{
          title: Pontoon.project.title,
          url: Pontoon.project.url,
          entities: []
        }];
        var counter = 0,
            prefix = 'l10n';
            
        $.ajax({
          url: 'https://' + Pontoon.transifex.username + ':' + Pontoon.transifex.password + 
               '@www.transifex.net/api/2/project/' + Pontoon.transifex.project + '/resource/' + 
               Pontoon.transifex.resource + '/translation/' + Pontoon.locale.code.replace("-", "_") + '/strings/',
          dataType: 'jsonp',
          success: function(data) {
            $('*').contents().each(function () {
              if (this.nodeType === Node.COMMENT_NODE && this.nodeValue.indexOf(prefix) === 0) {
                var entity = {},
                    parent = $(this).parent();
                entity.id = counter;
                counter++;
                $(this).remove();

                // Match strings in the document with Transifex data
                $(data).each(function() {
                  // Renedered text could be different than source
                  $('body').append('<div id="pontoon-string" style="display: none">' + this.key + '</div>');

                  if ($('#pontoon-string').html() === parent.html()) {
                    entity.original = this.key;
                    entity.comment = this.comment;
                    var translation = this.translation;
                    if (translation.length > 0) {
                      entity.translation = this.translation;
                      parent.html(translation);
                    }
                    this.pontoon = true;
                  }
                  $('#pontoon-string').remove();
                });

                // Head strings cannot be edited in-place
                if ($(this).parents('head').length === 0) {
                  entity.node = parent; // HTML Element holding string
                  entity.body = true;
                  makeEditable(entity.node.get(0)); // Make nodes editable
                  entity.node.get(0).entity = entity; // Store entity reference to the node
                  extendEntity(entity);
                }

                Pontoon.project.pages[Pontoon.project.page].entities.push(entity);
              }
            });

            // Prepare unmatched Transifex entities to be displayed in Advanced mode
            $(data).each(function() {
              if(!this.pontoon) {
                var entity = {};
                counter++;
                entity.id = counter;
                entity.original = this.key;
                entity.comment = this.comment;
                entity.translation = this.translation;
                Pontoon.project.pages[Pontoon.project.page].entities.push(entity);
              }
            });

            renderHandle();
          }
        });
      }



      /**
       * Show editable toolbar
       *
       * node DOM node
       */
      function showToolbar(node) {
        if ($(node).is('.editableToolbar')) {
          $(node).get(0).target.entity.hover();
          return true;
        } else {       
          var toolbar = $('.editableToolbar'),
              curTarget = toolbar.get(0).target,
              newTarget = node;
          if ($(curTarget).attr('contentEditable') === 'true') {
            return;
          }
          if (curTarget && curTarget !== newTarget) {
            hideToolbar(curTarget);
          }
          var left = newTarget.getBoundingClientRect().left + window.scrollX,
              top = newTarget.getBoundingClientRect().top + window.scrollY,
              toolbarTop = top - toolbar.outerHeight();

          toolbar.css('left', left);
          // Display toolbar at the bottom if otherwise too high
          if (toolbarTop >= 0) {
            toolbar.removeClass('bottom').css('top', toolbarTop);
          } else{
            toolbar.addClass('bottom').css('top', top + $(newTarget).outerHeight());
          };          
        }           
        var toolbarNode = toolbar.get(0);
        if (toolbarNode.I !== null) {
          clearTimeout(toolbarNode.I);
          toolbarNode.I = null;
        }
        if (newTarget) {
          toolbarNode.target = newTarget;
        }
        $(newTarget).addClass('hovered');
        postMessage("HOVER", newTarget.entity.id);
        toolbar.show();
      }



      /**
       * Hide editable toolbar
       *
       * node DOM node
       */
      function hideToolbar(node) {
        if ($(node).is('.editableToolbar')) {
          var toolbar = $(node);
        } else {
          var toolbar = $('.editableToolbar');
        }
        var toolbarNode = toolbar.get(0),
            target = toolbarNode.target;
        if ($(target).attr('contentEditable') === 'true') {
          return;
        }
        function hide() {
          if (target) {
            target.blur();
            stopEditing();
            if (target === toolbar.get(0).target) {
              toolbar.get(0).target = null;
              $(target).removeClass('hovered');
              postMessage("UNHOVER", target.entity.id);
              toolbar.hide();
            } else {
              $(target).removeClass('hovered');
              postMessage("UNHOVER", target.entity.id);
            }
          }
        }
        toolbar.get(0).I = setTimeout(hide, 50);
      }



      /**
       * Enable editable mode
       */
      function startEditing() {
      	var toolbar = $('.editableToolbar');
        toolbar.children().show().end()
          .find('.edit').hide();
        var target = toolbar.get(0).target;
        $(target).attr('contentEditable', true);
        postMessage("ACTIVE", target.entity.id);
        target.focus();
      }



      /**
       * Disable editable mode
       */
      function stopEditing() {
      	var toolbar = $('.editableToolbar');
        toolbar.children().hide().end()
          .find('.edit').show();
        var target = toolbar.get(0).target;
        $(target).attr('contentEditable', false);
        postMessage("INACTIVE", target.entity.id);
      }



      /**
       * Handle messages from project code
       */
      function receiveMessage(e) {
        if (e.source === Pontoon.app.win) { // TODO: hardcode Pontoon domain name
          var message = JSON.parse(e.data);
          if (message.type === "HOVER") {
            Pontoon.project.pages[Pontoon.project.page].entities[message.value].hover();
          } else if (message.type === "UNHOVER") {
            Pontoon.project.pages[Pontoon.project.page].entities[message.value].unhover();
          } else if (message.type === "EDIT") {
            $('.editableToolbar > .edit').click();
          } else if (message.type === "SAVE") {
            $('.editableToolbar').get(0).target.entity.node.html(message.value);
            $('.editableToolbar > .save').click();
          } else if (message.type === "CANCEL") {
            $('.editableToolbar > .cancel').click();
          } else if (message.type === "MODE") {
            $("#context .mode").attr("label", message.value + " mode");
          } else if (message.type === "HTML") {
            $.ajax(Pontoon.project.url).done(function(data) {
              var response = data,
                  index = data.toLowerCase().indexOf("<head"),
                  start = response.substring(0, index);
                  inner = $("html").clone();

              // Remove Pontoon-content
              inner
                .find("link[href*='pontoon.css']").remove().end()
                .find("script[src*='pontoon.js']").remove().end()
                .find("script[src*='jquery.min.js']").remove().end()
                .find(".editableToolbar").remove().end()
                .find("[contenteditable]").removeAttr("contenteditable").end()
                .find("body").removeAttr("contextmenu").end()
                .find("menu#context").remove();

              postMessage("HTML", start + inner.html() + "\n</html>");  
            });
          } else if (message.type === "USER") {
            Pontoon.user = message.value;
          }
        }
      }

      // Wait for main code messages
      window.addEventListener("message", receiveMessage, false);

      // Inject toolbar stylesheet
      $('<link>', {
        rel: 'stylesheet',
        href: Pontoon.app.path + 'static/css/project/pontoon.css'
      }).appendTo('head');

      // Disable links
      $('a').click(function(e) {
        e.preventDefault();
      });

      // Prepare editable toolbar
      var toolbar = $(
        "<div class='editableToolbar'>" +
          "<a href='#' class='edit'></a>" +
          "<a href='#' class='save'></a>" +
          "<a href='#' class='cancel'></a>" +
        "</div>").appendTo($('body'));
      toolbar.hover(function () {
        showToolbar(this);
      }, function () {
        hideToolbar(this);
      })
      .find('.edit').click(function () {
        startEditing();
        return false;
      }).end()
      .find('.save, .cancel').click(function () {
        stopEditing();
        return false;
      });

      // Enable context menu
      $('body')
        .attr("contextmenu", "context")
        .append(
        '<menu type="context" id="context">' +
          '<menuitem class="mode" label="Advanced mode" icon="../../client/lib/images/logo-small.png"></menuitem>' +
        '</menu>')
        .find("#context .mode").live("click", function() {
          postMessage("SWITCH");
        });

      // Determine if the current page is prepared for working with Pontoon
      var meta = $('head > meta[name=Pontoon]');
      if (meta.length > 0) {
        if (meta.attr('data-project')) {
          Pontoon.transifex.project = meta.data('project');
          /* Credentials for demo project to test PHP hooks */
          if (Pontoon.transifex.project === 'testpilot') {
            Pontoon.transifex.username = 'pontoon';
            Pontoon.transifex.password = 'mozilla';
          }
        }
        if (meta.attr('data-resource')) {
          Pontoon.transifex.resource = meta.data('resource');
        }
        if (meta.attr('data-info')) {
          $.getJSON(Pontoon.project.url + meta.data('info')).success(function (data) {
            Pontoon.project.info = data;
          });
        }
        Pontoon.project.title = document.title.split("-->")[1];
        loadEntities();
      } else {
        Pontoon.project.title = document.title;
        guessEntities();
      }

    });
  }

  /*
    * window.postMessage improved
    *
    * messageType data type to be sent to the other window
    * messageValue data value to be sent to the other window
    * otherWindow reference to another window
    * targetOrigin specifies what the origin of otherWindow must be
  */
  function postMessage(messageType, messageValue, otherWindow, targetOrigin) {
    var otherWindow = otherWindow || Pontoon.app.win,
        targetOrigin = targetOrigin || "*", // TODO: hardcode Pontoon domain name
        message = {
          type: messageType,
          value: messageValue
        }
    otherWindow.postMessage(JSON.stringify(message), targetOrigin);
  }

  // Load jQuery if not loaded yet
  function loadJquery() {
    if (!window.jQuery) {
      if (!jqueryAppended && document.body) {
        script.src = "//ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js";
        document.body.appendChild(script);
        jqueryAppended = true;
        arguments.callee();
      } else {
        window.setTimeout(arguments.callee, 100);
  	  }
    } else {
      jqueryLoaded();
    }
  }

  // Wait for main code trigger
  function initizalize(e) {
    // Prevent execution of any code if page not loaded in Pontoon iframe
    if (e.source === Pontoon.app.win) { // TODO: hardcode Pontoon domain name
      var message = JSON.parse(e.data);
      if (message.type === "INITIALIZE") {
        Pontoon.locale = message.value.locale; // Set locale
        Pontoon.app.path = message.value.path; // Set domain
        Pontoon.transifex = message.value.transifex; // Set Transifex credentials
        loadJquery();
        window.removeEventListener("message", initizalize, false);
      }
    }
  }
  window.addEventListener("message", initizalize, false);

  // When loaded inside web client, notify it that project supports Pontoon
  if (window !== window.top) {
    postMessage("SUPPORTED");
  }

})();
