
JS_FILES =		$(shell find lib -name '*.js')

NODEMOD_BIN =		node_modules/.bin

JSHINT =		$(NODEMOD_BIN)/jshint
JSCS =			$(NODEMOD_BIN)/jscs

check:
	$(JSHINT) $(JS_FILES)
	$(JSCS) $(JS_FILES)
