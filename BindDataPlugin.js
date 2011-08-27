/*

  	Takes a jquery object and binds its form elements with a backing javascript object. Takes two arguments: the object 
	to be bound to, and an optional "changeListener", which must implement a "changeHappened" method.

	Example: 
	
	// ============================
	// =     backing object       =
	// ============================
	
	demoBean = {
		prop1 : "val",
		prop2 : [
			{nestedObjProp:"val"},
			{nestedObjProp:"val"}
		],
		prop3 : [
			"stringVal1",
			"stringVal12"
		]
	}
	
	// ===========================
	// =        FORM FIELD       =
	// ===========================

	<input class="bindable" name="prop2[1].nestedObjProp">
	
	
	// ===========================
	// =       INVOCATION        =
	// ===========================
	
	$jq(".bindable").bindData( 
		demoBean, 
		{changeHappened: function(fieldPath){console.log("change")}}
	)
	
	
*/


(function($){
	
	if(KNZN){
	  var log = KNZN.Debug.NamedLogger("bindData");
	}
	
	// Returns the value of the property found at the given path
	// plus a function you can use to set that property.
	// Can be configured with a "translator" argument, which is an object
	// with a "read" and "write" property. The "read" property is a function
	// used to transform data passing from the form field to the backing object.
	// The "write" property transforms data passing from the backing object to the form field.
	var navigateObject = function(parentObj, pathArg, translatorArg){
	  var translator = $jq.extend({
	    read: function(arg){return arg;},
	    write: function(arg){return arg;}
	  }, typeof translatorArg === 'undefined'? {}:translatorArg);
		var immediateParent = parentObj;
		var path = pathArg
			.replace(/\[/g, ".")
			.replace(/\]\./g, ".")
			.replace(/\]/g, "")
			.split(/\./g);
		path = $jq.grep(path, function(item){return KNZN.notEmpty(item);});
		for(var i=0; i< (path.length-1); i++){
			var currentPathKey = path[i];
			immediateParent = immediateParent[currentPathKey];
			if(immediateParent === null){
				throw new Error("bindData plugin encountered a null value at  " + path[i] + " in path" + path);
			}
		}
		
		return {
			value: translator.write(immediateParent[path[path.length - 1]]),
			getValue: function(){
			  return translator.write(immediateParent[path[path.length - 1]]);
			},
			set: function(val){
			  val = translator.read(val);
			  if(typeof val == "string"){
			    val = String(val); // IE treats strings from form elements bizarrely in JSON.stringify, so force the value to be a real string
			  }
				immediateParent[path[path.length - 1]] = val; 
			},
			deleteObj: function(){
				if($.isArray(immediateParent)){
					immediateParent.splice(path[path.length - 1], 1);
				}else{
					delete  immediateParent[path[path.length - 1]];
				}
			} 
		}
		
	}
	
	var isEmpty = function(str){
		return str == null || str == "";
	}
	
	var bindData = function(){
		
		var parentObj,
		    radioButtons = [];
		var changeListener;
		var settings;
		var defaultSettings = {
			// if this flag is true, you can put a label in a field,
			// like <input value="Phone Number"/>, and the value
			// won't be replaced by a blank value in the parentObj
			// Additionally, if the user clicks on the field, the field will be cleared.
			allowLabelsInfields: true
		};
		
		// allow two forms: 
		// function(parentObj, changeListener)
		// and function(settings). 
		if(arguments.length == 2){
			parentObj = arguments[0];
			changeListener = arguments[1]
			settings = defaultSettings;
		}else{	
			settings = $jq.extend(defaultSettings, arguments[0]);
			parentObj = settings.parentObj;
			if(!parentObj){
			  throw new Error("If you give BindData plugin only one argument, that argument must be a settings object, and must have a parentObj attribute.")
			}
			changeListener = settings.changeListener;
		}
		
		var changeHappened = function(fieldPath){
			if(typeof changeListener != "undefined"){
  			if(typeof changeListener.changeHappened == "function"){
  				changeListener.changeHappened(fieldPath);
  			}else{
  				throw new Error("A changeListener must have a method called 'changeHappened'.");
  			}
  		};  
		};

		this.each(function(key,val){
			var formElem = $(val);
			var tagName = formElem.attr("tagName").toLowerCase();
			var fieldType;
		  if(tagName == "input"){
	    	fieldType = formElem.attr("type").toLowerCase();
		  }else{
		    fieldType = tagName;
		  }
		  
      // if there was a translator set up for a className that this field has, use it
      var translator;
      if(settings.translators){
        $jq.each(settings.translators, function(translatorClass,translatorArg){
          if(formElem.hasClass(translatorClass)){
            translator = translatorArg;
          }
        });
      }
		
			
			// Use the "name" attribute as the address of the property we want to bind to.
			// Except if it's a radio button, in which case, use the "value" because "name" is the name of the group
			// This should work for arbitrarily deeply nested data. 
			var fieldPath = formElem.attr(fieldType === "radio"? "value" : "name");
			
			// I've had some confusion about how to treat radio buttons. This is an ugly retro-fit. 
			// If you want the new style treatment for radio buttons, you need to give the buttons the class "singleValueForGroup".
			// The original reason for treating them weirdly was setting default communication addresses, where one set of radio buttons
			// would need to apply to multiple objects, rather than corresponding to a single property.
			if(fieldType === "radio" && formElem.hasClass("singleValueForGroup")){
			  fieldPath = formElem.attr("name")
			}
			
			var navigationResult = navigateObject(parentObj, fieldPath, translator);

			// populate the field with the data in the backing object
			
			switch(fieldType){
			  
			  case "checkbox":
			    formElem.attr("checked", navigationResult.value);
			    formElem.click(function(){
			      navigationResult.set(formElem.attr("checked")); 
			      changeHappened(fieldPath);
			    });
			    break;
			  
        // is it a radio button? If so, check it or not based on the 
        // boolean value of navigationResult.value
        // radio buttons are treated just like checkboxes, meaning the
        // backing bean must have one field per radio button. This could potentially
        // become cumbersome in the future and perhaps should change.
        case "radio":
          radioButtons.push(formElem);
          var getGroup = function(){
           return  $jq.grep(radioButtons, function(button){
              return button.attr("name") == formElem.attr("name");
            });
          }
          
          formElem.data("bindDataPlugin", {navigationResult: navigationResult});
          if(formElem.hasClass("singleValueForGroup")){
            // I think this loop is a bit redundant. It's probably ok to just set this once for each
            // I don't think "group" is really relevant in singleValueForGroup mode.
            $jq.each(getGroup(), function(index, button){
              var butt = $jq(button);
              butt.attr("checked", butt.val() === navigationResult.value)
            });
          }else{
            formElem.attr("checked", navigationResult.value);
          }
          formElem.change(function(){
            if(formElem.hasClass("singleValueForGroup")){
              if(formElem.attr("checked")){
                navigationResult.set(formElem.val());
              }
            }else{
              // Radio buttons only seem to update when _selected_, not 
              // when deselected. So if one is clicked, update the bound
              // object for all of them. I know it's a little ugly,
              // but it works.

              $jq.each(getGroup(), function(index, button){
                var butt = $jq(button);
                butt.data("bindDataPlugin").navigationResult.set(butt.attr("checked"));
              });
              navigationResult.set(formElem.attr("checked"));    
            }       
            changeHappened(fieldPath);
          });
          break;

        case "text":
          // if useFieldLabel is true, it means that the field is 
          // self-labeling. For example, an email field whose 
          // default value is "Enter Email".
          var useFieldLabel = isEmpty( navigationResult.value )
                   && !isEmpty( formElem.val() )  
                   && settings.allowLabelsInfields;
          if(useFieldLabel){
           var labelText = formElem.val();
           formElem.focus(function(){
             if(formElem.val() === labelText){
               formElem.val("");
             }
           });
           formElem.blur(function(){
             if(!formElem.val()){
               formElem.val(labelText);
             }
           });
          }else if(navigationResult.value){
           formElem.attr("value", navigationResult.value);
          }
          
          formElem.data("prevVal", formElem.val());
          
          formElem.keyup(function(e){
            var code = (e.keyCode ? e.keyCode : e.which);
            navigationResult.set(formElem.attr("value"));
            var notArrow = code != 8 && code != 37 && code != 39 && code != 38 && code != 40 && code != 9;
            if(notArrow && translator){ // don't mess with the form if the user is backspacing or using arrows, or if there's no translator
              formElem.val(navigationResult.getValue());
            }

            changeHappened(fieldPath);

          });

          break;
          
        case "select":
          var domElem = formElem.get(0);
  				$jq.each(domElem.options, function(index, option){
  					if(option.value === navigationResult.value){
  						domElem.selectedIndex = index;
  					}
  				});
  				formElem.change(function(){
  					navigationResult.set(formElem.val());
  					// not sure why I was calling formElem.val here. Commenting out. Will look further if something breaks.
            //formElem.val(navigationResult.getValue());
  					changeHappened(fieldPath);
  				})
          break;
          
        case "textarea":
          formElem.text(navigationResult.value);
          formElem.keyup(function(){
           changeHappened(fieldPath);
           navigationResult.set(formElem.val());
           changeHappened(fieldPath);
          });
          break;
      }
		  

		});
		return this;
	};
	
	bindData.navigateObject = navigateObject;
	
	$.fn.bindData = bindData;

})(jQuery);
