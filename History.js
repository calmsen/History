define("History", ["toastmessage"], function() {
    /**
     * Глобальные настройки 
     */
    var settings = {
        anchorSelector: "a.wp-ajax" // ссылка
        , anchorLoadingClass: "wp-ajax-load"
        , formSelector: "form.wp-ajax" // форма
        , errorMessage: window.errorMessage
    };
    /**
     * Глобальные переменные и константы
     */ 
    var xhr;
    var headEl = $("head");
    var bodyEl = $("body");
    var winEl = $(window);
    /**
     * Конструктор History. В конструкторе определюятся все свойства объекта. 
     * Защищенные и приватные свойства называются начиная с символа подчеркивания
     * @constructor
     * @param {Object} options
     */
    function History (options) {
        $.extend(this, settings, options);
        
        this._pushStateAllow = true; // нужно ли добавлять url в историю
        this._url = location.href; 
        this._realUrl = location.href; 
        
        this._init();
    }
    /**
     * Наследуемся от класса родителя и определяем методы. Защищенные и приватные методы называются начиная с символа подчеркивания
     */
    var methods = History.prototype = new Object();
    
    methods._proxy = function(name) {
        var obj = this;
        return this["proxy-" + name] = this["proxy-" + name] || function(event) {
            obj[name](event);
        };
    };
    
    methods._init = function() {
        var state = {
            url: this._url
        };
        history.replaceState(state, "", state._url);
        bodyEl.off("click.History", this.anchorSelector).on("click.History", this.anchorSelector, this._proxy("_anchorHandler"));
        bodyEl.off("submit.History", this.formSelector).on("submit.History", this.formSelector, this._proxy("_formHandler"));
        /*
        * Necessary hack because WebKit fires a popstate event on document load
        * https://code.google.com/p/chromium/issues/detail?id=63040
        * https://bugs.webkit.org/process_bug.cgi
        */
        var that = this;
        winEl.off("load.History").on('load.History', function() {
          setTimeout(function() {
            winEl.off("popstate.History").on("popstate.History", that._proxy("_popstateHandler"));
          }, 0);
        });
        // переместим все стили в head
        bodyEl.find("link").appendTo(headEl);
        // определим глобальную функцию для редиректов
        window.ajaxRedirect = this._proxy("ajaxRedirect");    
    };
    
    methods._popstateHandler = function () {
        // запретим вставку url в history
        this._pushStateAllow = false;
        this._sendAjax(history.state.url);
    };
    
    methods._anchorHandler = function ( event ) {
        // найдем ссылку которую перехватываем, через event.currentTarget 
        this._targetElement = $(event.currentTarget);
        if (!this._targetElement.is(this.anchorSelector))
            return;
        event.preventDefault();
        if (this._targetElement.hasClass(this.anchorLoadingClass)) 
            return;
        var url = this._targetElement.attr("href") || location.href.split("?")[0];                       
        this._sendAjax(url);        
    };
    
    methods._formHandler = function ( event ) {
        // найдем форму которую перехватываем, через event.currentTarget 
        this._targetElement = $(event.currentTarget);
        if (!this._targetElement.is(this.formSelector))
            return;
        event.preventDefault();           
        var url = this._targetElement.attr("action") || location.href.split("?")[0];                      
        this._sendAjax(url + "?" + this._targetElement.serialize().replace(/[a-zA-Z-_]+=(?:&|$)/, ""));
        
    };
    
    methods._sendAjax = function (url) {
        if (xhr) {
            xhr.abort();
        }
        
        this._url = url;
        
        this._ajaxBeforeSend();
        
        xhr = $.ajax({
            url : this._url
            , data: "wpAjax=1"
            , headers: {"X-Referer": this._realUrl}
            , context: this
            , success: this._ajaxSuccess
            , error: this._ajaxError
        });
    };
    
    methods._addLinksToHead = function (holder) {
        holder.find("link").each(function() {
            var link = $(this);
            if ($("link[href='"+ link.attr("href") +"']").length > 0) {
                link.remove();
                return;
            }
            link.appendTo(headEl);
        });
    };
    
    methods._ajaxAbort = function() {
        $("." + this.anchorLoadingClass).removeClass(this.anchorLoadingClass);
        $(".page-loader").hide();
    };
    
    methods._ajaxBeforeSend = function() {
        // если инициатором запроса была ссылка
        if (this._targetElement) {
            this._targetElement.addClass(this.anchorLoadingClass)
            if (!$(this._targetElement).hasClass("no-global-loader")) {
                $(".page-loader").show();
            }
        } else {
            $(".page-loader").show();
        }
    };
    
    methods._ajaxSuccess = function (html) {
        // если инициатором запроса была ссылка
        if (this._targetElement) {
            this._targetElement.removeClass(this.anchorLoadingClass)
        }
        $(".page-loader").hide();
        if (this._pushStateAllow) {
            var state = {
                url: this._url.replace(/wpAjax=1(?:&|$)/g, "")
            };
            history.pushState( state, "", state.url );
        }
        this._realUrl = this._url.replace(/wpAjax=1(?:&|$)/g, "");
        var $html = $(html.trim());
        // переместим все стили в head
        this._addLinksToHead($html);
        
        $html.replaceAll($("#" + $html.attr("id")));
        this._ajaxComplete();
    };
    
    methods._ajaxError = function (xhr, status) {
        // если инициатором запроса была ссылка
        if (this._targetElement) {
            this._targetElement.removeClass(this.anchorLoadingClass);
        }
        $(".page-loader").hide();
        if (status == "abort") {
            this._ajaxAbort();
            return;
        }
        var html = xhr.responseText || "";
        if (this._pushStateAllow) {
            var state = {
                url: this._url.replace(/wpAjax=1(?:&|$)/g, "")
            };
            history.pushState( state, "", state.url );
        }
        this._realUrl = this._url.replace(/wpAjax=1(?:&|$)/g, "");
        var $html = $(html.trim());
        $html.replaceAll($("#" + $html.attr("id")));
        this._ajaxComplete();
    };
    
    methods._ajaxComplete = function() {
        // разрешим вставку url в history
        this._pushStateAllow = true;
        delete(this._targetElement);        
    };
    
    methods.ajaxRedirect = function (href) {
        this._sendAjax(href);
    };
    
    return History;
});