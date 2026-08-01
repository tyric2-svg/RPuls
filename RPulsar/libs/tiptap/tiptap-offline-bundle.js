/**
 * Tiptap Offline Bundle для RPulsar v2
 * Полностью автономная версия для работы без интернета
 */
(function(global) {
  'use strict';

  // === ProseMirror: state (prosemirror-state.js) ===
  (function() {
    var exports = {};
    var module = { exports: exports };
    import { Slice, Fragment, Mark, Node } from 'prosemirror-model';
import { ReplaceStep, ReplaceAroundStep, Transform } from 'prosemirror-transform';

const classesById = Object.create(null);
/**
Superclass for editor selections. Every selection type should
extend this. Should not be instantiated directly.
*/
class Selection {
    /**
    Initialize a selection with the head and anchor and ranges. If no
    ranges are given, constructs a single range across `$anchor` and
    `$head`.
    */
    constructor(
    /**
    The resolved anchor of the selection (the side that stays in
    place when the selection is modified).
    */
    $anchor, 
    /**
    The resolved head of the selection (the side that moves when
    the selection is modified).
    */
    $head, ranges) {
        this.$anchor = $anchor;
        this.$head = $head;
        this.ranges = ranges || [new SelectionRange($anchor.min($head), $anchor.max($head))];
    }
    /**
    The selection's anchor, as an unresolved position.
    */
    get anchor() { return this.$anchor.pos; }
    /**
    The selection's head.
    */
    get head() { return this.$head.pos; }
    /**
    The lower bound of the selection's main range.
    */
    get from() { return this.$from.pos; }
    /**
    The upper bound of the selection's main range.
    */
    get to() { return this.$to.pos; }
    /**
    The resolved lower  bound of the selection's main range.
    */
    get $from() {
        return this.ranges[0].$from;
    }
    /**
    The resolved upper bound of the selection's main range.
    */
    get $to() {
        return this.ranges[0].$to;
    }
    /**
    Indicates whether the selection contains any content.
    */
    get empty() {
        let ranges = this.ranges;
        for (let i = 0; i < ranges.length; i++)
            if (ranges[i].$from.pos != ranges[i].$to.pos)
                return false;
        return true;
    }
    /**
    Get the content of this selection as a slice.
    */
    content() {
        return this.$from.doc.slice(this.from, this.to, true);
    }
    /**
    Replace the selection with a slice or, if no slice is given,
    delete the selection. Will append to the given transaction.
    */
    replace(tr, content = Slice.empty) {
        // Put the new selection at the position after the inserted
        // content. When that ended in an inline node, search backwards,
        // to get the position after that node. If not, search forward.
        let lastNode = content.content.lastChild, lastParent = null;
        for (let i = 0; i < content.openEnd; i++) {
            lastParent = lastNode;
            lastNode = lastNode.lastChild;
        }
        let mapFrom = tr.steps.length, ranges = this.ranges;
        for (let i = 0; i < ranges.length; i++) {
            let { $from, $to } = ranges[i], mapping = tr.mapping.slice(mapFrom);
            tr.replaceRange(mapping.map($from.pos), mapping.map($to.pos), i ? Slice.empty : content);
            if (i == 0)
                selectionToInsertionEnd(tr, mapFrom, (lastNode ? lastNode.isInline : lastParent && lastParent.isTextblock) ? -1 : 1);
        }
    }
    /**
    Replace the selection with the given node, appending the changes
    to the given transaction.
    */
    replaceWith(tr, node) {
        let mapFrom = tr.steps.length, ranges = this.ranges;
        for (let i = 0; i < ranges.length; i++) {
            let { $from, $to } = ranges[i], mapping = tr.mapping.slice(mapFrom);
            let from = mapping.map($from.pos), to = mapping.map($to.pos);
            if (i) {
                tr.deleteRange(from, to);
            }
            else {
                tr.replaceRangeWith(from, to, node);
                selectionToInsertionEnd(tr, mapFrom, node.isInline ? -1 : 1);
            }
        }
    }
    /**
    Find a valid cursor or leaf node selection starting at the given
    position and searching back if `dir` is negative, and forward if
    positive. When `textOnly` is true, only consider cursor
    selections. Will return null when no valid selection position is
    found.
    */
    static findFrom($pos, dir, textOnly = false) {
        let inner = $pos.parent.inlineContent ? new TextSelection($pos)
            : findSelectionIn($pos.node(0), $pos.parent, $pos.pos, $pos.index(), dir, textOnly);
        if (inner)
            return inner;
        for (let depth = $pos.depth - 1; depth >= 0; depth--) {
            let found = dir < 0
                ? findSelectionIn($pos.node(0), $pos.node(depth), $pos.before(depth + 1), $pos.index(depth), dir, textOnly)
                : findSelectionIn($pos.node(0), $pos.node(depth), $pos.after(depth + 1), $pos.index(depth) + 1, dir, textOnly);
            if (found)
                return found;
        }
        return null;
    }
    /**
    Find a valid cursor or leaf node selection near the given
    position. Searches forward first by default, but if `bias` is
    negative, it will search backwards first.
    */
    static near($pos, bias = 1) {
        return this.findFrom($pos, bias) || this.findFrom($pos, -bias) || new AllSelection($pos.node(0));
    }
    /**
    Find the cursor or leaf node selection closest to the start of
    the given document. Will return an
    [`AllSelection`](https://prosemirror.net/docs/ref/#state.AllSelection) if no valid position
    exists.
    */
    static atStart(doc) {
        return findSelectionIn(doc, doc, 0, 0, 1) || new AllSelection(doc);
    }
    /**
    Find the cursor or leaf node selection closest to the end of the
    given document.
    */
    static atEnd(doc) {
        return findSelectionIn(doc, doc, doc.content.size, doc.childCount, -1) || new AllSelection(doc);
    }
    /**
    Deserialize the JSON representation of a selection. Must be
    implemented for custom classes (as a static class method).
    */
    static fromJSON(doc, json) {
        if (!json || !json.type)
            throw new RangeError("Invalid input for Selection.fromJSON");
        let cls = classesById[json.type];
        if (!cls)
            throw new RangeError(`No selection type ${json.type} defined`);
        return cls.fromJSON(doc, json);
    }
    /**
    To be able to deserialize selections from JSON, custom selection
    classes must register themselves with an ID string, so that they
    can be disambiguated. Try to pick something that's unlikely to
    clash with classes from other modules.
    */
    static jsonID(id, selectionClass) {
        if (id in classesById)
            throw new RangeError("Duplicate use of selection JSON ID " + id);
        classesById[id] = selectionClass;
        selectionClass.prototype.jsonID = id;
        return selectionClass;
    }
    /**
    Get a [bookmark](https://prosemirror.net/docs/ref/#state.SelectionBookmark) for this selection,
    which is a value that can be mapped without having access to a
    current document, and later resolved to a real selection for a
    given document again. (This is used mostly by the history to
    track and restore old selections.) The default implementation of
    this method just converts the selection to a text selection and
    returns the bookmark for that.
    */
    getBookmark() {
        return TextSelection.between(this.$anchor, this.$head).getBookmark();
    }
}
Selection.prototype.visible = true;
/**
Represents a selected range in a document.
*/
class SelectionRange {
    /**
    Create a range.
    */
    constructor(
    /**
    The lower bound of the range.
    */
    $from, 
    /**
    The upper bound of the range.
    */
    $to) {
        this.$from = $from;
        this.$to = $to;
    }
}
let warnedAboutTextSelection = false;
function checkTextSelection($pos) {
    if (!warnedAboutTextSelection && !$pos.parent.inlineContent) {
        warnedAboutTextSelection = true;
        console["warn"]("TextSelection endpoint not pointing into a node with inline content (" + $pos.parent.type.name + ")");
    }
}
/**
A text selection represents a classical editor selection, with a
head (the moving side) and anchor (immobile side), both of which
point into textblock nodes. It can be empty (a regular cursor
position).
*/
class TextSelection extends Selection {
    /**
    Construct a text selection between the given points.
    */
    constructor($anchor, $head = $anchor) {
        checkTextSelection($anchor);
        checkTextSelection($head);
        super($anchor, $head);
    }
    /**
    Returns a resolved position if this is a cursor selection (an
    empty text selection), and null otherwise.
    */
    get $cursor() { return this.$anchor.pos == this.$head.pos ? this.$head : null; }
    map(doc, mapping) {
        let $head = doc.resolve(mapping.map(this.head));
        if (!$head.parent.inlineContent)
            return Selection.near($head);
        let $anchor = doc.resolve(mapping.map(this.anchor));
        return new TextSelection($anchor.parent.inlineContent ? $anchor : $head, $head);
    }
    replace(tr, content = Slice.empty) {
        super.replace(tr, content);
        if (content == Slice.empty) {
            let marks = this.$from.marksAcross(this.$to);
            if (marks)
                tr.ensureMarks(marks);
        }
    }
    eq(other) {
        return other instanceof TextSelection && other.anchor == this.anchor && other.head == this.head;
    }
    getBookmark() {
        return new TextBookmark(this.anchor, this.head);
    }
    toJSON() {
        return { type: "text", anchor: this.anchor, head: this.head };
    }
    /**
    @internal
    */
    static fromJSON(doc, json) {
        if (typeof json.anchor != "number" || typeof json.head != "number")
            throw new RangeError("Invalid input for TextSelection.fromJSON");
        return new TextSelection(doc.resolve(json.anchor), doc.resolve(json.head));
    }
    /**
    Create a text selection from non-resolved positions.
    */
    static create(doc, anchor, head = anchor) {
        let $anchor = doc.resolve(anchor);
        return new this($anchor, head == anchor ? $anchor : doc.resolve(head));
    }
    /**
    Return a text selection that spans the given positions or, if
    they aren't text positions, find a text selection near them.
    `bias` determines whether the method searches forward (default)
    or backwards (negative number) first. Will fall back to calling
    [`Selection.near`](https://prosemirror.net/docs/ref/#state.Selection^near) when the document
    doesn't contain a valid text position.
    */
    static between($anchor, $head, bias) {
        let dPos = $anchor.pos - $head.pos;
        if (!bias || dPos)
            bias = dPos >= 0 ? 1 : -1;
        if (!$head.parent.inlineContent) {
            let found = Selection.findFrom($head, bias, true) || Selection.findFrom($head, -bias, true);
            if (found)
                $head = found.$head;
            else
                return Selection.near($head, bias);
        }
        if (!$anchor.parent.inlineContent) {
            if (dPos == 0) {
                $anchor = $head;
            }
            else {
                $anchor = (Selection.findFrom($anchor, -bias, true) || Selection.findFrom($anchor, bias, true)).$anchor;
                if (($anchor.pos < $head.pos) != (dPos < 0))
                    $anchor = $head;
            }
        }
        return new TextSelection($anchor, $head);
    }
}
Selection.jsonID("text", TextSelection);
class TextBookmark {
    constructor(anchor, head) {
        this.anchor = anchor;
        this.head = head;
    }
    map(mapping) {
        return new TextBookmark(mapping.map(this.anchor), mapping.map(this.head));
    }
    resolve(doc) {
        return TextSelection.between(doc.resolve(this.anchor), doc.resolve(this.head));
    }
}
/**
A node selection is a selection that points at a single node. All
nodes marked [selectable](https://prosemirror.net/docs/ref/#model.NodeSpec.selectable) can be the
target of a node selection. In such a selection, `from` and `to`
point directly before and after the selected node, `anchor` equals
`from`, and `head` equals `to`..
*/
class NodeSelection extends Selection {
    /**
    Create a node selection. Does not verify the validity of its
    argument.
    */
    constructor($pos) {
        let node = $pos.nodeAfter;
        let $end = $pos.node(0).resolve($pos.pos + node.nodeSize);
        super($pos, $end);
        this.node = node;
    }
    map(doc, mapping) {
        let { deleted, pos } = mapping.mapResult(this.anchor);
        let $pos = doc.resolve(pos);
        if (deleted)
            return Selection.near($pos);
        return new NodeSelection($pos);
    }
    content() {
        return new Slice(Fragment.from(this.node), 0, 0);
    }
    eq(other) {
        return other instanceof NodeSelection && other.anchor == this.anchor;
    }
    toJSON() {
        return { type: "node", anchor: this.anchor };
    }
    getBookmark() { return new NodeBookmark(this.anchor); }
    /**
    @internal
    */
    static fromJSON(doc, json) {
        if (typeof json.anchor != "number")
            throw new RangeError("Invalid input for NodeSelection.fromJSON");
        return new NodeSelection(doc.resolve(json.anchor));
    }
    /**
    Create a node selection from non-resolved positions.
    */
    static create(doc, from) {
        return new NodeSelection(doc.resolve(from));
    }
    /**
    Determines whether the given node may be selected as a node
    selection.
    */
    static isSelectable(node) {
        return !node.isText && node.type.spec.selectable !== false;
    }
}
NodeSelection.prototype.visible = false;
Selection.jsonID("node", NodeSelection);
class NodeBookmark {
    constructor(anchor) {
        this.anchor = anchor;
    }
    map(mapping) {
        let { deleted, pos } = mapping.mapResult(this.anchor);
        return deleted ? new TextBookmark(pos, pos) : new NodeBookmark(pos);
    }
    resolve(doc) {
        let $pos = doc.resolve(this.anchor), node = $pos.nodeAfter;
        if (node && NodeSelection.isSelectable(node))
            return new NodeSelection($pos);
        return Selection.near($pos);
    }
}
/**
A selection type that represents selecting the whole document
(which can not necessarily be expressed with a text selection, when
there are for example leaf block nodes at the start or end of the
document).
*/
class AllSelection extends Selection {
    /**
    Create an all-selection over the given document.
    */
    constructor(doc) {
        super(doc.resolve(0), doc.resolve(doc.content.size));
    }
    replace(tr, content = Slice.empty) {
        if (content == Slice.empty) {
            tr.delete(0, tr.doc.content.size);
            let sel = Selection.atStart(tr.doc);
            if (!sel.eq(tr.selection))
                tr.setSelection(sel);
        }
        else {
            super.replace(tr, content);
        }
    }
    toJSON() { return { type: "all" }; }
    /**
    @internal
    */
    static fromJSON(doc) { return new AllSelection(doc); }
    map(doc) { return new AllSelection(doc); }
    eq(other) { return other instanceof AllSelection; }
    getBookmark() { return AllBookmark; }
}
Selection.jsonID("all", AllSelection);
const AllBookmark = {
    map() { return this; },
    resolve(doc) { return new AllSelection(doc); }
};
// FIXME we'll need some awareness of text direction when scanning for selections
// Try to find a selection inside the given node. `pos` points at the
// position where the search starts. When `text` is true, only return
// text selections.
function findSelectionIn(doc, node, pos, index, dir, text = false) {
    if (node.inlineContent)
        return TextSelection.create(doc, pos);
    for (let i = index - (dir > 0 ? 0 : 1); dir > 0 ? i < node.childCount : i >= 0; i += dir) {
        let child = node.child(i);
        if (!child.isAtom) {
            let inner = findSelectionIn(doc, child, pos + dir, dir < 0 ? child.childCount : 0, dir, text);
            if (inner)
                return inner;
        }
        else if (!text && NodeSelection.isSelectable(child)) {
            return NodeSelection.create(doc, pos - (dir < 0 ? child.nodeSize : 0));
        }
        pos += child.nodeSize * dir;
    }
    return null;
}
function selectionToInsertionEnd(tr, startLen, bias) {
    let last = tr.steps.length - 1;
    if (last < startLen)
        return;
    let step = tr.steps[last];
    if (!(step instanceof ReplaceStep || step instanceof ReplaceAroundStep))
        return;
    let map = tr.mapping.maps[last], end;
    map.forEach((_from, _to, _newFrom, newTo) => { if (end == null)
        end = newTo; });
    tr.setSelection(Selection.near(tr.doc.resolve(end), bias));
}

const UPDATED_SEL = 1, UPDATED_MARKS = 2, UPDATED_SCROLL = 4;
/**
An editor state transaction, which can be applied to a state to
create an updated state. Use
[`EditorState.tr`](https://prosemirror.net/docs/ref/#state.EditorState.tr) to create an instance.

Transactions track changes to the document (they are a subclass of
[`Transform`](https://prosemirror.net/docs/ref/#transform.Transform)), but also other state changes,
like selection updates and adjustments of the set of [stored
marks](https://prosemirror.net/docs/ref/#state.EditorState.storedMarks). In addition, you can store
metadata properties in a transaction, which are extra pieces of
information that client code or plugins can use to describe what a
transaction represents, so that they can update their [own
state](https://prosemirror.net/docs/ref/#state.StateField) accordingly.

The [editor view](https://prosemirror.net/docs/ref/#view.EditorView) uses a few metadata
properties: it will attach a property `"pointer"` with the value
`true` to selection transactions directly caused by mouse or touch
input, a `"composition"` property holding an ID identifying the
composition that caused it to transactions caused by composed DOM
input, and a `"uiEvent"` property of that may be `"paste"`,
`"cut"`, or `"drop"`.
*/
class Transaction extends Transform {
    /**
    @internal
    */
    constructor(state) {
        super(state.doc);
        // The step count for which the current selection is valid.
        this.curSelectionFor = 0;
        // Bitfield to track which aspects of the state were updated by
        // this transaction.
        this.updated = 0;
        // Object used to store metadata properties for the transaction.
        this.meta = Object.create(null);
        this.time = Date.now();
        this.curSelection = state.selection;
        this.storedMarks = state.storedMarks;
    }
    /**
    The transaction's current selection. This defaults to the editor
    selection [mapped](https://prosemirror.net/docs/ref/#state.Selection.map) through the steps in the
    transaction, but can be overwritten with
    [`setSelection`](https://prosemirror.net/docs/ref/#state.Transaction.setSelection).
    */
    get selection() {
        if (this.curSelectionFor < this.steps.length) {
            this.curSelection = this.curSelection.map(this.doc, this.mapping.slice(this.curSelectionFor));
            this.curSelectionFor = this.steps.length;
        }
        return this.curSelection;
    }
    /**
    Update the transaction's current selection. Will determine the
    selection that the editor gets when the transaction is applied.
    */
    setSelection(selection) {
        if (selection.$from.doc != this.doc)
            throw new RangeError("Selection passed to setSelection must point at the current document");
        this.curSelection = selection;
        this.curSelectionFor = this.steps.length;
        this.updated = (this.updated | UPDATED_SEL) & ~UPDATED_MARKS;
        this.storedMarks = null;
        return this;
    }
    /**
    Whether the selection was explicitly updated by this transaction.
    */
    get selectionSet() {
        return (this.updated & UPDATED_SEL) > 0;
    }
    /**
    Set the current stored marks.
    */
    setStoredMarks(marks) {
        this.storedMarks = marks;
        this.updated |= UPDATED_MARKS;
        return this;
    }
    /**
    Make sure the current stored marks or, if that is null, the marks
    at the selection, match the given set of marks. Does nothing if
    this is already the case.
    */
    ensureMarks(marks) {
        if (!Mark.sameSet(this.storedMarks || this.selection.$from.marks(), marks))
            this.setStoredMarks(marks);
        return this;
    }
    /**
    Add a mark to the set of stored marks.
    */
    addStoredMark(mark) {
        return this.ensureMarks(mark.addToSet(this.storedMarks || this.selection.$head.marks()));
    }
    /**
    Remove a mark or mark type from the set of stored marks.
    */
    removeStoredMark(mark) {
        return this.ensureMarks(mark.removeFromSet(this.storedMarks || this.selection.$head.marks()));
    }
    /**
    Whether the stored marks were explicitly set for this transaction.
    */
    get storedMarksSet() {
        return (this.updated & UPDATED_MARKS) > 0;
    }
    /**
    @internal
    */
    addStep(step, doc) {
        super.addStep(step, doc);
        this.updated = this.updated & ~UPDATED_MARKS;
        this.storedMarks = null;
    }
    /**
    Update the timestamp for the transaction.
    */
    setTime(time) {
        this.time = time;
        return this;
    }
    /**
    Replace the current selection with the given slice.
    */
    replaceSelection(slice) {
        this.selection.replace(this, slice);
        return this;
    }
    /**
    Replace the selection with the given node. When `inheritMarks` is
    true and the content is inline, it inherits the marks from the
    place where it is inserted.
    */
    replaceSelectionWith(node, inheritMarks = true) {
        let selection = this.selection;
        if (inheritMarks)
            node = node.mark(this.storedMarks || (selection.empty ? selection.$from.marks() : (selection.$from.marksAcross(selection.$to) || Mark.none)));
        selection.replaceWith(this, node);
        return this;
    }
    /**
    Delete the selection.
    */
    deleteSelection() {
        this.selection.replace(this);
        return this;
    }
    /**
    Replace the given range, or the selection if no range is given,
    with a text node containing the given string.
    */
    insertText(text, from, to) {
        let schema = this.doc.type.schema;
        if (from == null) {
            if (!text)
                return this.deleteSelection();
            return this.replaceSelectionWith(schema.text(text), true);
        }
        else {
            if (to == null)
                to = from;
            to = to == null ? from : to;
            if (!text)
                return this.deleteRange(from, to);
            let marks = this.storedMarks;
            if (!marks) {
                let $from = this.doc.resolve(from);
                marks = to == from ? $from.marks() : $from.marksAcross(this.doc.resolve(to));
            }
            this.replaceRangeWith(from, to, schema.text(text, marks));
            if (!this.selection.empty)
                this.setSelection(Selection.near(this.selection.$to));
            return this;
        }
    }
    /**
    Store a metadata property in this transaction, keyed either by
    name or by plugin.
    */
    setMeta(key, value) {
        this.meta[typeof key == "string" ? key : key.key] = value;
        return this;
    }
    /**
    Retrieve a metadata property for a given name or plugin.
    */
    getMeta(key) {
        return this.meta[typeof key == "string" ? key : key.key];
    }
    /**
    Returns true if this transaction doesn't contain any metadata,
    and can thus safely be extended.
    */
    get isGeneric() {
        for (let _ in this.meta)
            return false;
        return true;
    }
    /**
    Indicate that the editor should scroll the selection into view
    when updated to the state produced by this transaction.
    */
    scrollIntoView() {
        this.updated |= UPDATED_SCROLL;
        return this;
    }
    /**
    True when this transaction has had `scrollIntoView` called on it.
    */
    get scrolledIntoView() {
        return (this.updated & UPDATED_SCROLL) > 0;
    }
}

function bind(f, self) {
    return !self || !f ? f : f.bind(self);
}
class FieldDesc {
    constructor(name, desc, self) {
        this.name = name;
        this.init = bind(desc.init, self);
        this.apply = bind(desc.apply, self);
    }
}
const baseFields = [
    new FieldDesc("doc", {
        init(config) { return config.doc || config.schema.topNodeType.createAndFill(); },
        apply(tr) { return tr.doc; }
    }),
    new FieldDesc("selection", {
        init(config, instance) { return config.selection || Selection.atStart(instance.doc); },
        apply(tr) { return tr.selection; }
    }),
    new FieldDesc("storedMarks", {
        init(config) { return config.storedMarks || null; },
        apply(tr, _marks, _old, state) { return state.selection.$cursor ? tr.storedMarks : null; }
    }),
    new FieldDesc("scrollToSelection", {
        init() { return 0; },
        apply(tr, prev) { return tr.scrolledIntoView ? prev + 1 : prev; }
    })
];
// Object wrapping the part of a state object that stays the same
// across transactions. Stored in the state's `config` property.
class Configuration {
    constructor(schema, plugins) {
        this.schema = schema;
        this.plugins = [];
        this.pluginsByKey = Object.create(null);
        this.fields = baseFields.slice();
        if (plugins)
            plugins.forEach(plugin => {
                if (this.pluginsByKey[plugin.key])
                    throw new RangeError("Adding different instances of a keyed plugin (" + plugin.key + ")");
                this.plugins.push(plugin);
                this.pluginsByKey[plugin.key] = plugin;
                if (plugin.spec.state)
                    this.fields.push(new FieldDesc(plugin.key, plugin.spec.state, plugin));
            });
    }
}
/**
The state of a ProseMirror editor is represented by an object of
this type. A state is a persistent data structure—it isn't
updated, but rather a new state value is computed from an old one
using the [`apply`](https://prosemirror.net/docs/ref/#state.EditorState.apply) method.

A state holds a number of built-in fields, and plugins can
[define](https://prosemirror.net/docs/ref/#state.PluginSpec.state) additional fields.
*/
class EditorState {
    /**
    @internal
    */
    constructor(
    /**
    @internal
    */
    config) {
        this.config = config;
    }
    /**
    The schema of the state's document.
    */
    get schema() {
        return this.config.schema;
    }
    /**
    The plugins that are active in this state.
    */
    get plugins() {
        return this.config.plugins;
    }
    /**
    Apply the given transaction to produce a new state.
    */
    apply(tr) {
        return this.applyTransaction(tr).state;
    }
    /**
    @internal
    */
    filterTransaction(tr, ignore = -1) {
        for (let i = 0; i < this.config.plugins.length; i++)
            if (i != ignore) {
                let plugin = this.config.plugins[i];
                if (plugin.spec.filterTransaction && !plugin.spec.filterTransaction.call(plugin, tr, this))
                    return false;
            }
        return true;
    }
    /**
    Verbose variant of [`apply`](https://prosemirror.net/docs/ref/#state.EditorState.apply) that
    returns the precise transactions that were applied (which might
    be influenced by the [transaction
    hooks](https://prosemirror.net/docs/ref/#state.PluginSpec.filterTransaction) of
    plugins) along with the new state.
    */
    applyTransaction(rootTr) {
        if (!this.filterTransaction(rootTr))
            return { state: this, transactions: [] };
        let trs = [rootTr], newState = this.applyInner(rootTr), seen = null;
        // This loop repeatedly gives plugins a chance to respond to
        // transactions as new transactions are added, making sure to only
        // pass the transactions the plugin did not see before.
        for (;;) {
            let haveNew = false;
            for (let i = 0; i < this.config.plugins.length; i++) {
                let plugin = this.config.plugins[i];
                if (plugin.spec.appendTransaction) {
                    let n = seen ? seen[i].n : 0, oldState = seen ? seen[i].state : this;
                    let tr = n < trs.length &&
                        plugin.spec.appendTransaction.call(plugin, n ? trs.slice(n) : trs, oldState, newState);
                    if (tr && newState.filterTransaction(tr, i)) {
                        tr.setMeta("appendedTransaction", rootTr);
                        if (!seen) {
                            seen = [];
                            for (let j = 0; j < this.config.plugins.length; j++)
                                seen.push(j < i ? { state: newState, n: trs.length } : { state: this, n: 0 });
                        }
                        trs.push(tr);
                        newState = newState.applyInner(tr);
                        haveNew = true;
                    }
                    if (seen)
                        seen[i] = { state: newState, n: trs.length };
                }
            }
            if (!haveNew)
                return { state: newState, transactions: trs };
        }
    }
    /**
    @internal
    */
    applyInner(tr) {
        if (!tr.before.eq(this.doc))
            throw new RangeError("Applying a mismatched transaction");
        let newInstance = new EditorState(this.config), fields = this.config.fields;
        for (let i = 0; i < fields.length; i++) {
            let field = fields[i];
            newInstance[field.name] = field.apply(tr, this[field.name], this, newInstance);
        }
        return newInstance;
    }
    /**
    Start a [transaction](https://prosemirror.net/docs/ref/#state.Transaction) from this state.
    */
    get tr() { return new Transaction(this); }
    /**
    Create a new state.
    */
    static create(config) {
        let $config = new Configuration(config.doc ? config.doc.type.schema : config.schema, config.plugins);
        let instance = new EditorState($config);
        for (let i = 0; i < $config.fields.length; i++)
            instance[$config.fields[i].name] = $config.fields[i].init(config, instance);
        return instance;
    }
    /**
    Create a new state based on this one, but with an adjusted set
    of active plugins. State fields that exist in both sets of
    plugins are kept unchanged. Those that no longer exist are
    dropped, and those that are new are initialized using their
    [`init`](https://prosemirror.net/docs/ref/#state.StateField.init) method, passing in the new
    configuration object..
    */
    reconfigure(config) {
        let $config = new Configuration(this.schema, config.plugins);
        let fields = $config.fields, instance = new EditorState($config);
        for (let i = 0; i < fields.length; i++) {
            let name = fields[i].name;
            instance[name] = this.hasOwnProperty(name) ? this[name] : fields[i].init(config, instance);
        }
        return instance;
    }
    /**
    Serialize this state to JSON. If you want to serialize the state
    of plugins, pass an object mapping property names to use in the
    resulting JSON object to plugin objects. The argument may also be
    a string or number, in which case it is ignored, to support the
    way `JSON.stringify` calls `toString` methods.
    */
    toJSON(pluginFields) {
        let result = { doc: this.doc.toJSON(), selection: this.selection.toJSON() };
        if (this.storedMarks)
            result.storedMarks = this.storedMarks.map(m => m.toJSON());
        if (pluginFields && typeof pluginFields == 'object')
            for (let prop in pluginFields) {
                if (prop == "doc" || prop == "selection")
                    throw new RangeError("The JSON fields `doc` and `selection` are reserved");
                let plugin = pluginFields[prop], state = plugin.spec.state;
                if (state && state.toJSON)
                    result[prop] = state.toJSON.call(plugin, this[plugin.key]);
            }
        return result;
    }
    /**
    Deserialize a JSON representation of a state. `config` should
    have at least a `schema` field, and should contain array of
    plugins to initialize the state with. `pluginFields` can be used
    to deserialize the state of plugins, by associating plugin
    instances with the property names they use in the JSON object.
    */
    static fromJSON(config, json, pluginFields) {
        if (!json)
            throw new RangeError("Invalid input for EditorState.fromJSON");
        if (!config.schema)
            throw new RangeError("Required config field 'schema' missing");
        let $config = new Configuration(config.schema, config.plugins);
        let instance = new EditorState($config);
        $config.fields.forEach(field => {
            if (field.name == "doc") {
                instance.doc = Node.fromJSON(config.schema, json.doc);
            }
            else if (field.name == "selection") {
                instance.selection = Selection.fromJSON(instance.doc, json.selection);
            }
            else if (field.name == "storedMarks") {
                if (json.storedMarks)
                    instance.storedMarks = json.storedMarks.map(config.schema.markFromJSON);
            }
            else {
                if (pluginFields)
                    for (let prop in pluginFields) {
                        let plugin = pluginFields[prop], state = plugin.spec.state;
                        if (plugin.key == field.name && state && state.fromJSON &&
                            Object.prototype.hasOwnProperty.call(json, prop)) {
                            instance[field.name] = state.fromJSON.call(plugin, config, json[prop], instance);
                            return;
                        }
                    }
                instance[field.name] = field.init(config, instance);
            }
        });
        return instance;
    }
}

function bindProps(obj, self, target) {
    for (let prop in obj) {
        let val = obj[prop];
        if (val instanceof Function)
            val = val.bind(self);
        else if (prop == "handleDOMEvents")
            val = bindProps(val, self, {});
        target[prop] = val;
    }
    return target;
}
/**
Plugins bundle functionality that can be added to an editor.
They are part of the [editor state](https://prosemirror.net/docs/ref/#state.EditorState) and
may influence that state and the view that contains it.
*/
class Plugin {
    /**
    Create a plugin.
    */
    constructor(
    /**
    The plugin's [spec object](https://prosemirror.net/docs/ref/#state.PluginSpec).
    */
    spec) {
        this.spec = spec;
        /**
        The [props](https://prosemirror.net/docs/ref/#view.EditorProps) exported by this plugin.
        */
        this.props = {};
        if (spec.props)
            bindProps(spec.props, this, this.props);
        this.key = spec.key ? spec.key.key : createKey("plugin");
    }
    /**
    Extract the plugin's state field from an editor state.
    */
    getState(state) { return state[this.key]; }
}
const keys = Object.create(null);
function createKey(name) {
    if (name in keys)
        return name + "$" + ++keys[name];
    keys[name] = 0;
    return name + "$";
}
/**
A key is used to [tag](https://prosemirror.net/docs/ref/#state.PluginSpec.key) plugins in a way
that makes it possible to find them, given an editor state.
Assigning a key does mean only one plugin of that type can be
active in a state.
*/
class PluginKey {
    /**
    Create a plugin key.
    */
    constructor(name = "key") { this.key = createKey(name); }
    /**
    Get the active plugin with this key, if any, from an editor
    state.
    */
    get(state) { return state.config.pluginsByKey[this.key]; }
    /**
    Get the plugin's state from an editor state.
    */
    getState(state) { return state[this.key]; }
}

export { AllSelection, EditorState, NodeSelection, Plugin, PluginKey, Selection, SelectionRange, TextSelection, Transaction };

    global.state = module.exports || exports;
  })();

  // === ProseMirror: view (prosemirror-view.js) ===
  (function() {
    var exports = {};
    var module = { exports: exports };
    Package version not found: prosemirror-view@3.24.0
    global.view = module.exports || exports;
  })();

  // === ProseMirror: keymap (prosemirror-keymap.js) ===
  (function() {
    var exports = {};
    var module = { exports: exports };
    import { keyName, base } from 'w3c-keyname';
import { Plugin } from 'prosemirror-state';

const mac = typeof navigator != "undefined" ? /Mac|iP(hone|[oa]d)/.test(navigator.platform) : false;
function normalizeKeyName(name) {
    let parts = name.split(/-(?!$)/), result = parts[parts.length - 1];
    if (result == "Space")
        result = " ";
    let alt, ctrl, shift, meta;
    for (let i = 0; i < parts.length - 1; i++) {
        let mod = parts[i];
        if (/^(cmd|meta|m)$/i.test(mod))
            meta = true;
        else if (/^a(lt)?$/i.test(mod))
            alt = true;
        else if (/^(c|ctrl|control)$/i.test(mod))
            ctrl = true;
        else if (/^s(hift)?$/i.test(mod))
            shift = true;
        else if (/^mod$/i.test(mod)) {
            if (mac)
                meta = true;
            else
                ctrl = true;
        }
        else
            throw new Error("Unrecognized modifier name: " + mod);
    }
    if (alt)
        result = "Alt-" + result;
    if (ctrl)
        result = "Ctrl-" + result;
    if (meta)
        result = "Meta-" + result;
    if (shift)
        result = "Shift-" + result;
    return result;
}
function normalize(map) {
    let copy = Object.create(null);
    for (let prop in map)
        copy[normalizeKeyName(prop)] = map[prop];
    return copy;
}
function modifiers(name, event, shift = true) {
    if (event.altKey)
        name = "Alt-" + name;
    if (event.ctrlKey)
        name = "Ctrl-" + name;
    if (event.metaKey)
        name = "Meta-" + name;
    if (shift && event.shiftKey)
        name = "Shift-" + name;
    return name;
}
/**
Create a keymap plugin for the given set of bindings.

Bindings should map key names to [command](https://prosemirror.net/docs/ref/#commands)-style
functions, which will be called with `(EditorState, dispatch,
EditorView)` arguments, and should return true when they've handled
the key. Note that the view argument isn't part of the command
protocol, but can be used as an escape hatch if a binding needs to
directly interact with the UI.

Key names may be strings like `"Shift-Ctrl-Enter"`—a key
identifier prefixed with zero or more modifiers. Key identifiers
are based on the strings that can appear in
[`KeyEvent.key`](https:developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key).
Use lowercase letters to refer to letter keys (or uppercase letters
if you want shift to be held). You may use `"Space"` as an alias
for the `" "` name.

Modifiers can be given in any order. `Shift-` (or `s-`), `Alt-` (or
`a-`), `Ctrl-` (or `c-` or `Control-`) and `Cmd-` (or `m-` or
`Meta-`) are recognized. For characters that are created by holding
shift, the `Shift-` prefix is implied, and should not be added
explicitly.

You can use `Mod-` as a shorthand for `Cmd-` on Mac and `Ctrl-` on
other platforms.

You can add multiple keymap plugins to an editor. The order in
which they appear determines their precedence (the ones early in
the array get to dispatch first).
*/
function keymap(bindings) {
    return new Plugin({ props: { handleKeyDown: keydownHandler(bindings) } });
}
/**
Given a set of bindings (using the same format as
[`keymap`](https://prosemirror.net/docs/ref/#keymap.keymap)), return a [keydown
handler](https://prosemirror.net/docs/ref/#view.EditorProps.handleKeyDown) that handles them.
*/
function keydownHandler(bindings) {
    let map = normalize(bindings);
    return function (view, event) {
        let name = keyName(event), baseName, direct = map[modifiers(name, event)];
        if (direct && direct(view.state, view.dispatch, view))
            return true;
        // A character key
        if (name.length == 1 && name != " ") {
            if (event.shiftKey) {
                // In case the name was already modified by shift, try looking
                // it up without its shift modifier
                let noShift = map[modifiers(name, event, false)];
                if (noShift && noShift(view.state, view.dispatch, view))
                    return true;
            }
            if ((event.shiftKey || event.altKey || event.metaKey || name.charCodeAt(0) > 127) &&
                (baseName = base[event.keyCode]) && baseName != name) {
                // Try falling back to the keyCode when there's a modifier
                // active or the character produced isn't ASCII, and our table
                // produces a different name from the the keyCode. See #668,
                // #1060
                let fromCode = map[modifiers(baseName, event)];
                if (fromCode && fromCode(view.state, view.dispatch, view))
                    return true;
            }
        }
        return false;
    };
}

export { keydownHandler, keymap };

    global.keymap = module.exports || exports;
  })();

  // === ProseMirror: model (prosemirror-model.js) ===
  (function() {
    var exports = {};
    var module = { exports: exports };
    import OrderedMap from 'orderedmap';

function findDiffStart(a, b, pos) {
    for (let i = 0;; i++) {
        if (i == a.childCount || i == b.childCount)
            return a.childCount == b.childCount ? null : pos;
        let childA = a.child(i), childB = b.child(i);
        if (childA == childB) {
            pos += childA.nodeSize;
            continue;
        }
        if (!childA.sameMarkup(childB))
            return pos;
        if (childA.isText && childA.text != childB.text) {
            for (let j = 0; childA.text[j] == childB.text[j]; j++)
                pos++;
            return pos;
        }
        if (childA.content.size || childB.content.size) {
            let inner = findDiffStart(childA.content, childB.content, pos + 1);
            if (inner != null)
                return inner;
        }
        pos += childA.nodeSize;
    }
}
function findDiffEnd(a, b, posA, posB) {
    for (let iA = a.childCount, iB = b.childCount;;) {
        if (iA == 0 || iB == 0)
            return iA == iB ? null : { a: posA, b: posB };
        let childA = a.child(--iA), childB = b.child(--iB), size = childA.nodeSize;
        if (childA == childB) {
            posA -= size;
            posB -= size;
            continue;
        }
        if (!childA.sameMarkup(childB))
            return { a: posA, b: posB };
        if (childA.isText && childA.text != childB.text) {
            let same = 0, minSize = Math.min(childA.text.length, childB.text.length);
            while (same < minSize && childA.text[childA.text.length - same - 1] == childB.text[childB.text.length - same - 1]) {
                same++;
                posA--;
                posB--;
            }
            return { a: posA, b: posB };
        }
        if (childA.content.size || childB.content.size) {
            let inner = findDiffEnd(childA.content, childB.content, posA - 1, posB - 1);
            if (inner)
                return inner;
        }
        posA -= size;
        posB -= size;
    }
}

/**
A fragment represents a node's collection of child nodes.

Like nodes, fragments are persistent data structures, and you
should not mutate them or their content. Rather, you create new
instances whenever needed. The API tries to make this easy.
*/
class Fragment {
    /**
    @internal
    */
    constructor(
    /**
    @internal
    */
    content, size) {
        this.content = content;
        this.size = size || 0;
        if (size == null)
            for (let i = 0; i < content.length; i++)
                this.size += content[i].nodeSize;
    }
    /**
    Invoke a callback for all descendant nodes between the given two
    positions (relative to start of this fragment). Doesn't descend
    into a node when the callback returns `false`.
    */
    nodesBetween(from, to, f, nodeStart = 0, parent) {
        for (let i = 0, pos = 0; pos < to; i++) {
            let child = this.content[i], end = pos + child.nodeSize;
            if (end > from && f(child, nodeStart + pos, parent || null, i) !== false && child.content.size) {
                let start = pos + 1;
                child.nodesBetween(Math.max(0, from - start), Math.min(child.content.size, to - start), f, nodeStart + start);
            }
            pos = end;
        }
    }
    /**
    Call the given callback for every descendant node. `pos` will be
    relative to the start of the fragment. The callback may return
    `false` to prevent traversal of a given node's children.
    */
    descendants(f) {
        this.nodesBetween(0, this.size, f);
    }
    /**
    Extract the text between `from` and `to`. See the same method on
    [`Node`](https://prosemirror.net/docs/ref/#model.Node.textBetween).
    */
    textBetween(from, to, blockSeparator, leafText) {
        let text = "", first = true;
        this.nodesBetween(from, to, (node, pos) => {
            let nodeText = node.isText ? node.text.slice(Math.max(from, pos) - pos, to - pos)
                : !node.isLeaf ? ""
                    : leafText ? (typeof leafText === "function" ? leafText(node) : leafText)
                        : node.type.spec.leafText ? node.type.spec.leafText(node)
                            : "";
            if (node.isBlock && (node.isLeaf && nodeText || node.isTextblock) && blockSeparator) {
                if (first)
                    first = false;
                else
                    text += blockSeparator;
            }
            text += nodeText;
        }, 0);
        return text;
    }
    /**
    Create a new fragment containing the combined content of this
    fragment and the other.
    */
    append(other) {
        if (!other.size)
            return this;
        if (!this.size)
            return other;
        let last = this.lastChild, first = other.firstChild, content = this.content.slice(), i = 0;
        if (last.isText && last.sameMarkup(first)) {
            content[content.length - 1] = last.withText(last.text + first.text);
            i = 1;
        }
        for (; i < other.content.length; i++)
            content.push(other.content[i]);
        return new Fragment(content, this.size + other.size);
    }
    /**
    Cut out the sub-fragment between the two given positions.
    */
    cut(from, to = this.size) {
        if (from == 0 && to == this.size)
            return this;
        let result = [], size = 0;
        if (to > from)
            for (let i = 0, pos = 0; pos < to; i++) {
                let child = this.content[i], end = pos + child.nodeSize;
                if (end > from) {
                    if (pos < from || end > to) {
                        if (child.isText)
                            child = child.cut(Math.max(0, from - pos), Math.min(child.text.length, to - pos));
                        else
                            child = child.cut(Math.max(0, from - pos - 1), Math.min(child.content.size, to - pos - 1));
                    }
                    result.push(child);
                    size += child.nodeSize;
                }
                pos = end;
            }
        return new Fragment(result, size);
    }
    /**
    @internal
    */
    cutByIndex(from, to) {
        if (from == to)
            return Fragment.empty;
        if (from == 0 && to == this.content.length)
            return this;
        return new Fragment(this.content.slice(from, to));
    }
    /**
    Create a new fragment in which the node at the given index is
    replaced by the given node.
    */
    replaceChild(index, node) {
        let current = this.content[index];
        if (current == node)
            return this;
        let copy = this.content.slice();
        let size = this.size + node.nodeSize - current.nodeSize;
        copy[index] = node;
        return new Fragment(copy, size);
    }
    /**
    Create a new fragment by prepending the given node to this
    fragment.
    */
    addToStart(node) {
        return new Fragment([node].concat(this.content), this.size + node.nodeSize);
    }
    /**
    Create a new fragment by appending the given node to this
    fragment.
    */
    addToEnd(node) {
        return new Fragment(this.content.concat(node), this.size + node.nodeSize);
    }
    /**
    Compare this fragment to another one.
    */
    eq(other) {
        if (this.content.length != other.content.length)
            return false;
        for (let i = 0; i < this.content.length; i++)
            if (!this.content[i].eq(other.content[i]))
                return false;
        return true;
    }
    /**
    The first child of the fragment, or `null` if it is empty.
    */
    get firstChild() { return this.content.length ? this.content[0] : null; }
    /**
    The last child of the fragment, or `null` if it is empty.
    */
    get lastChild() { return this.content.length ? this.content[this.content.length - 1] : null; }
    /**
    The number of child nodes in this fragment.
    */
    get childCount() { return this.content.length; }
    /**
    Get the child node at the given index. Raise an error when the
    index is out of range.
    */
    child(index) {
        let found = this.content[index];
        if (!found)
            throw new RangeError("Index " + index + " out of range for " + this);
        return found;
    }
    /**
    Get the child node at the given index, if it exists.
    */
    maybeChild(index) {
        return this.content[index] || null;
    }
    /**
    Call `f` for every child node, passing the node, its offset
    into this parent node, and its index.
    */
    forEach(f) {
        for (let i = 0, p = 0; i < this.content.length; i++) {
            let child = this.content[i];
            f(child, p, i);
            p += child.nodeSize;
        }
    }
    /**
    Find the first position at which this fragment and another
    fragment differ, or `null` if they are the same.
    */
    findDiffStart(other, pos = 0) {
        return findDiffStart(this, other, pos);
    }
    /**
    Find the first position, searching from the end, at which this
    fragment and the given fragment differ, or `null` if they are
    the same. Since this position will not be the same in both
    nodes, an object with two separate positions is returned.
    */
    findDiffEnd(other, pos = this.size, otherPos = other.size) {
        return findDiffEnd(this, other, pos, otherPos);
    }
    /**
    Find the index and inner offset corresponding to a given relative
    position in this fragment. The result object will be reused
    (overwritten) the next time the function is called. (Not public.)
    */
    findIndex(pos, round = -1) {
        if (pos == 0)
            return retIndex(0, pos);
        if (pos == this.size)
            return retIndex(this.content.length, pos);
        if (pos > this.size || pos < 0)
            throw new RangeError(`Position ${pos} outside of fragment (${this})`);
        for (let i = 0, curPos = 0;; i++) {
            let cur = this.child(i), end = curPos + cur.nodeSize;
            if (end >= pos) {
                if (end == pos || round > 0)
                    return retIndex(i + 1, end);
                return retIndex(i, curPos);
            }
            curPos = end;
        }
    }
    /**
    Return a debugging string that describes this fragment.
    */
    toString() { return "<" + this.toStringInner() + ">"; }
    /**
    @internal
    */
    toStringInner() { return this.content.join(", "); }
    /**
    Create a JSON-serializeable representation of this fragment.
    */
    toJSON() {
        return this.content.length ? this.content.map(n => n.toJSON()) : null;
    }
    /**
    Deserialize a fragment from its JSON representation.
    */
    static fromJSON(schema, value) {
        if (!value)
            return Fragment.empty;
        if (!Array.isArray(value))
            throw new RangeError("Invalid input for Fragment.fromJSON");
        return new Fragment(value.map(schema.nodeFromJSON));
    }
    /**
    Build a fragment from an array of nodes. Ensures that adjacent
    text nodes with the same marks are joined together.
    */
    static fromArray(array) {
        if (!array.length)
            return Fragment.empty;
        let joined, size = 0;
        for (let i = 0; i < array.length; i++) {
            let node = array[i];
            size += node.nodeSize;
            if (i && node.isText && array[i - 1].sameMarkup(node)) {
                if (!joined)
                    joined = array.slice(0, i);
                joined[joined.length - 1] = node
                    .withText(joined[joined.length - 1].text + node.text);
            }
            else if (joined) {
                joined.push(node);
            }
        }
        return new Fragment(joined || array, size);
    }
    /**
    Create a fragment from something that can be interpreted as a
    set of nodes. For `null`, it returns the empty fragment. For a
    fragment, the fragment itself. For a node or array of nodes, a
    fragment containing those nodes.
    */
    static from(nodes) {
        if (!nodes)
            return Fragment.empty;
        if (nodes instanceof Fragment)
            return nodes;
        if (Array.isArray(nodes))
            return this.fromArray(nodes);
        if (nodes.attrs)
            return new Fragment([nodes], nodes.nodeSize);
        throw new RangeError("Can not convert " + nodes + " to a Fragment" +
            (nodes.nodesBetween ? " (looks like multiple versions of prosemirror-model were loaded)" : ""));
    }
}
/**
An empty fragment. Intended to be reused whenever a node doesn't
contain anything (rather than allocating a new empty fragment for
each leaf node).
*/
Fragment.empty = new Fragment([], 0);
const found = { index: 0, offset: 0 };
function retIndex(index, offset) {
    found.index = index;
    found.offset = offset;
    return found;
}

function compareDeep(a, b) {
    if (a === b)
        return true;
    if (!(a && typeof a == "object") ||
        !(b && typeof b == "object"))
        return false;
    let array = Array.isArray(a);
    if (Array.isArray(b) != array)
        return false;
    if (array) {
        if (a.length != b.length)
            return false;
        for (let i = 0; i < a.length; i++)
            if (!compareDeep(a[i], b[i]))
                return false;
    }
    else {
        for (let p in a)
            if (!(p in b) || !compareDeep(a[p], b[p]))
                return false;
        for (let p in b)
            if (!(p in a))
                return false;
    }
    return true;
}

/**
A mark is a piece of information that can be attached to a node,
such as it being emphasized, in code font, or a link. It has a
type and optionally a set of attributes that provide further
information (such as the target of the link). Marks are created
through a `Schema`, which controls which types exist and which
attributes they have.
*/
class Mark {
    /**
    @internal
    */
    constructor(
    /**
    The type of this mark.
    */
    type, 
    /**
    The attributes associated with this mark.
    */
    attrs) {
        this.type = type;
        this.attrs = attrs;
    }
    /**
    Given a set of marks, create a new set which contains this one as
    well, in the right position. If this mark is already in the set,
    the set itself is returned. If any marks that are set to be
    [exclusive](https://prosemirror.net/docs/ref/#model.MarkSpec.excludes) with this mark are present,
    those are replaced by this one.
    */
    addToSet(set) {
        let copy, placed = false;
        for (let i = 0; i < set.length; i++) {
            let other = set[i];
            if (this.eq(other))
                return set;
            if (this.type.excludes(other.type)) {
                if (!copy)
                    copy = set.slice(0, i);
            }
            else if (other.type.excludes(this.type)) {
                return set;
            }
            else {
                if (!placed && other.type.rank > this.type.rank) {
                    if (!copy)
                        copy = set.slice(0, i);
                    copy.push(this);
                    placed = true;
                }
                if (copy)
                    copy.push(other);
            }
        }
        if (!copy)
            copy = set.slice();
        if (!placed)
            copy.push(this);
        return copy;
    }
    /**
    Remove this mark from the given set, returning a new set. If this
    mark is not in the set, the set itself is returned.
    */
    removeFromSet(set) {
        for (let i = 0; i < set.length; i++)
            if (this.eq(set[i]))
                return set.slice(0, i).concat(set.slice(i + 1));
        return set;
    }
    /**
    Test whether this mark is in the given set of marks.
    */
    isInSet(set) {
        for (let i = 0; i < set.length; i++)
            if (this.eq(set[i]))
                return true;
        return false;
    }
    /**
    Test whether this mark has the same type and attributes as
    another mark.
    */
    eq(other) {
        return this == other ||
            (this.type == other.type && compareDeep(this.attrs, other.attrs));
    }
    /**
    Convert this mark to a JSON-serializeable representation.
    */
    toJSON() {
        let obj = { type: this.type.name };
        for (let _ in this.attrs) {
            obj.attrs = this.attrs;
            break;
        }
        return obj;
    }
    /**
    Deserialize a mark from JSON.
    */
    static fromJSON(schema, json) {
        if (!json)
            throw new RangeError("Invalid input for Mark.fromJSON");
        let type = schema.marks[json.type];
        if (!type)
            throw new RangeError(`There is no mark type ${json.type} in this schema`);
        return type.create(json.attrs);
    }
    /**
    Test whether two sets of marks are identical.
    */
    static sameSet(a, b) {
        if (a == b)
            return true;
        if (a.length != b.length)
            return false;
        for (let i = 0; i < a.length; i++)
            if (!a[i].eq(b[i]))
                return false;
        return true;
    }
    /**
    Create a properly sorted mark set from null, a single mark, or an
    unsorted array of marks.
    */
    static setFrom(marks) {
        if (!marks || Array.isArray(marks) && marks.length == 0)
            return Mark.none;
        if (marks instanceof Mark)
            return [marks];
        let copy = marks.slice();
        copy.sort((a, b) => a.type.rank - b.type.rank);
        return copy;
    }
}
/**
The empty set of marks.
*/
Mark.none = [];

/**
Error type raised by [`Node.replace`](https://prosemirror.net/docs/ref/#model.Node.replace) when
given an invalid replacement.
*/
class ReplaceError extends Error {
}
/*
ReplaceError = function(this: any, message: string) {
  let err = Error.call(this, message)
  ;(err as any).__proto__ = ReplaceError.prototype
  return err
} as any

ReplaceError.prototype = Object.create(Error.prototype)
ReplaceError.prototype.constructor = ReplaceError
ReplaceError.prototype.name = "ReplaceError"
*/
/**
A slice represents a piece cut out of a larger document. It
stores not only a fragment, but also the depth up to which nodes on
both side are ‘open’ (cut through).
*/
class Slice {
    /**
    Create a slice. When specifying a non-zero open depth, you must
    make sure that there are nodes of at least that depth at the
    appropriate side of the fragment—i.e. if the fragment is an
    empty paragraph node, `openStart` and `openEnd` can't be greater
    than 1.
    
    It is not necessary for the content of open nodes to conform to
    the schema's content constraints, though it should be a valid
    start/end/middle for such a node, depending on which sides are
    open.
    */
    constructor(
    /**
    The slice's content.
    */
    content, 
    /**
    The open depth at the start of the fragment.
    */
    openStart, 
    /**
    The open depth at the end.
    */
    openEnd) {
        this.content = content;
        this.openStart = openStart;
        this.openEnd = openEnd;
    }
    /**
    The size this slice would add when inserted into a document.
    */
    get size() {
        return this.content.size - this.openStart - this.openEnd;
    }
    /**
    @internal
    */
    insertAt(pos, fragment) {
        let content = insertInto(this.content, pos + this.openStart, fragment);
        return content && new Slice(content, this.openStart, this.openEnd);
    }
    /**
    @internal
    */
    removeBetween(from, to) {
        return new Slice(removeRange(this.content, from + this.openStart, to + this.openStart), this.openStart, this.openEnd);
    }
    /**
    Tests whether this slice is equal to another slice.
    */
    eq(other) {
        return this.content.eq(other.content) && this.openStart == other.openStart && this.openEnd == other.openEnd;
    }
    /**
    @internal
    */
    toString() {
        return this.content + "(" + this.openStart + "," + this.openEnd + ")";
    }
    /**
    Convert a slice to a JSON-serializable representation.
    */
    toJSON() {
        if (!this.content.size)
            return null;
        let json = { content: this.content.toJSON() };
        if (this.openStart > 0)
            json.openStart = this.openStart;
        if (this.openEnd > 0)
            json.openEnd = this.openEnd;
        return json;
    }
    /**
    Deserialize a slice from its JSON representation.
    */
    static fromJSON(schema, json) {
        if (!json)
            return Slice.empty;
        let openStart = json.openStart || 0, openEnd = json.openEnd || 0;
        if (typeof openStart != "number" || typeof openEnd != "number")
            throw new RangeError("Invalid input for Slice.fromJSON");
        return new Slice(Fragment.fromJSON(schema, json.content), openStart, openEnd);
    }
    /**
    Create a slice from a fragment by taking the maximum possible
    open value on both side of the fragment.
    */
    static maxOpen(fragment, openIsolating = true) {
        let openStart = 0, openEnd = 0;
        for (let n = fragment.firstChild; n && !n.isLeaf && (openIsolating || !n.type.spec.isolating); n = n.firstChild)
            openStart++;
        for (let n = fragment.lastChild; n && !n.isLeaf && (openIsolating || !n.type.spec.isolating); n = n.lastChild)
            openEnd++;
        return new Slice(fragment, openStart, openEnd);
    }
}
/**
The empty slice.
*/
Slice.empty = new Slice(Fragment.empty, 0, 0);
function removeRange(content, from, to) {
    let { index, offset } = content.findIndex(from), child = content.maybeChild(index);
    let { index: indexTo, offset: offsetTo } = content.findIndex(to);
    if (offset == from || child.isText) {
        if (offsetTo != to && !content.child(indexTo).isText)
            throw new RangeError("Removing non-flat range");
        return content.cut(0, from).append(content.cut(to));
    }
    if (index != indexTo)
        throw new RangeError("Removing non-flat range");
    return content.replaceChild(index, child.copy(removeRange(child.content, from - offset - 1, to - offset - 1)));
}
function insertInto(content, dist, insert, parent) {
    let { index, offset } = content.findIndex(dist), child = content.maybeChild(index);
    if (offset == dist || child.isText) {
        if (parent && !parent.canReplace(index, index, insert))
            return null;
        return content.cut(0, dist).append(insert).append(content.cut(dist));
    }
    let inner = insertInto(child.content, dist - offset - 1, insert);
    return inner && content.replaceChild(index, child.copy(inner));
}
function replace($from, $to, slice) {
    if (slice.openStart > $from.depth)
        throw new ReplaceError("Inserted content deeper than insertion position");
    if ($from.depth - slice.openStart != $to.depth - slice.openEnd)
        throw new ReplaceError("Inconsistent open depths");
    return replaceOuter($from, $to, slice, 0);
}
function replaceOuter($from, $to, slice, depth) {
    let index = $from.index(depth), node = $from.node(depth);
    if (index == $to.index(depth) && depth < $from.depth - slice.openStart) {
        let inner = replaceOuter($from, $to, slice, depth + 1);
        return node.copy(node.content.replaceChild(index, inner));
    }
    else if (!slice.content.size) {
        return close(node, replaceTwoWay($from, $to, depth));
    }
    else if (!slice.openStart && !slice.openEnd && $from.depth == depth && $to.depth == depth) { // Simple, flat case
        let parent = $from.parent, content = parent.content;
        return close(parent, content.cut(0, $from.parentOffset).append(slice.content).append(content.cut($to.parentOffset)));
    }
    else {
        let { start, end } = prepareSliceForReplace(slice, $from);
        return close(node, replaceThreeWay($from, start, end, $to, depth));
    }
}
function checkJoin(main, sub) {
    if (!sub.type.compatibleContent(main.type))
        throw new ReplaceError("Cannot join " + sub.type.name + " onto " + main.type.name);
}
function joinable($before, $after, depth) {
    let node = $before.node(depth);
    checkJoin(node, $after.node(depth));
    return node;
}
function addNode(child, target) {
    let last = target.length - 1;
    if (last >= 0 && child.isText && child.sameMarkup(target[last]))
        target[last] = child.withText(target[last].text + child.text);
    else
        target.push(child);
}
function addRange($start, $end, depth, target) {
    let node = ($end || $start).node(depth);
    let startIndex = 0, endIndex = $end ? $end.index(depth) : node.childCount;
    if ($start) {
        startIndex = $start.index(depth);
        if ($start.depth > depth) {
            startIndex++;
        }
        else if ($start.textOffset) {
            addNode($start.nodeAfter, target);
            startIndex++;
        }
    }
    for (let i = startIndex; i < endIndex; i++)
        addNode(node.child(i), target);
    if ($end && $end.depth == depth && $end.textOffset)
        addNode($end.nodeBefore, target);
}
function close(node, content) {
    node.type.checkContent(content);
    return node.copy(content);
}
function replaceThreeWay($from, $start, $end, $to, depth) {
    let openStart = $from.depth > depth && joinable($from, $start, depth + 1);
    let openEnd = $to.depth > depth && joinable($end, $to, depth + 1);
    let content = [];
    addRange(null, $from, depth, content);
    if (openStart && openEnd && $start.index(depth) == $end.index(depth)) {
        checkJoin(openStart, openEnd);
        addNode(close(openStart, replaceThreeWay($from, $start, $end, $to, depth + 1)), content);
    }
    else {
        if (openStart)
            addNode(close(openStart, replaceTwoWay($from, $start, depth + 1)), content);
        addRange($start, $end, depth, content);
        if (openEnd)
            addNode(close(openEnd, replaceTwoWay($end, $to, depth + 1)), content);
    }
    addRange($to, null, depth, content);
    return new Fragment(content);
}
function replaceTwoWay($from, $to, depth) {
    let content = [];
    addRange(null, $from, depth, content);
    if ($from.depth > depth) {
        let type = joinable($from, $to, depth + 1);
        addNode(close(type, replaceTwoWay($from, $to, depth + 1)), content);
    }
    addRange($to, null, depth, content);
    return new Fragment(content);
}
function prepareSliceForReplace(slice, $along) {
    let extra = $along.depth - slice.openStart, parent = $along.node(extra);
    let node = parent.copy(slice.content);
    for (let i = extra - 1; i >= 0; i--)
        node = $along.node(i).copy(Fragment.from(node));
    return { start: node.resolveNoCache(slice.openStart + extra),
        end: node.resolveNoCache(node.content.size - slice.openEnd - extra) };
}

/**
You can [_resolve_](https://prosemirror.net/docs/ref/#model.Node.resolve) a position to get more
information about it. Objects of this class represent such a
resolved position, providing various pieces of context
information, and some helper methods.

Throughout this interface, methods that take an optional `depth`
parameter will interpret undefined as `this.depth` and negative
numbers as `this.depth + value`.
*/
class ResolvedPos {
    /**
    @internal
    */
    constructor(
    /**
    The position that was resolved.
    */
    pos, 
    /**
    @internal
    */
    path, 
    /**
    The offset this position has into its parent node.
    */
    parentOffset) {
        this.pos = pos;
        this.path = path;
        this.parentOffset = parentOffset;
        this.depth = path.length / 3 - 1;
    }
    /**
    @internal
    */
    resolveDepth(val) {
        if (val == null)
            return this.depth;
        if (val < 0)
            return this.depth + val;
        return val;
    }
    /**
    The parent node that the position points into. Note that even if
    a position points into a text node, that node is not considered
    the parent—text nodes are ‘flat’ in this model, and have no content.
    */
    get parent() { return this.node(this.depth); }
    /**
    The root node in which the position was resolved.
    */
    get doc() { return this.node(0); }
    /**
    The ancestor node at the given level. `p.node(p.depth)` is the
    same as `p.parent`.
    */
    node(depth) { return this.path[this.resolveDepth(depth) * 3]; }
    /**
    The index into the ancestor at the given level. If this points
    at the 3rd node in the 2nd paragraph on the top level, for
    example, `p.index(0)` is 1 and `p.index(1)` is 2.
    */
    index(depth) { return this.path[this.resolveDepth(depth) * 3 + 1]; }
    /**
    The index pointing after this position into the ancestor at the
    given level.
    */
    indexAfter(depth) {
        depth = this.resolveDepth(depth);
        return this.index(depth) + (depth == this.depth && !this.textOffset ? 0 : 1);
    }
    /**
    The (absolute) position at the start of the node at the given
    level.
    */
    start(depth) {
        depth = this.resolveDepth(depth);
        return depth == 0 ? 0 : this.path[depth * 3 - 1] + 1;
    }
    /**
    The (absolute) position at the end of the node at the given
    level.
    */
    end(depth) {
        depth = this.resolveDepth(depth);
        return this.start(depth) + this.node(depth).content.size;
    }
    /**
    The (absolute) position directly before the wrapping node at the
    given level, or, when `depth` is `this.depth + 1`, the original
    position.
    */
    before(depth) {
        depth = this.resolveDepth(depth);
        if (!depth)
            throw new RangeError("There is no position before the top-level node");
        return depth == this.depth + 1 ? this.pos : this.path[depth * 3 - 1];
    }
    /**
    The (absolute) position directly after the wrapping node at the
    given level, or the original position when `depth` is `this.depth + 1`.
    */
    after(depth) {
        depth = this.resolveDepth(depth);
        if (!depth)
            throw new RangeError("There is no position after the top-level node");
        return depth == this.depth + 1 ? this.pos : this.path[depth * 3 - 1] + this.path[depth * 3].nodeSize;
    }
    /**
    When this position points into a text node, this returns the
    distance between the position and the start of the text node.
    Will be zero for positions that point between nodes.
    */
    get textOffset() { return this.pos - this.path[this.path.length - 1]; }
    /**
    Get the node directly after the position, if any. If the position
    points into a text node, only the part of that node after the
    position is returned.
    */
    get nodeAfter() {
        let parent = this.parent, index = this.index(this.depth);
        if (index == parent.childCount)
            return null;
        let dOff = this.pos - this.path[this.path.length - 1], child = parent.child(index);
        return dOff ? parent.child(index).cut(dOff) : child;
    }
    /**
    Get the node directly before the position, if any. If the
    position points into a text node, only the part of that node
    before the position is returned.
    */
    get nodeBefore() {
        let index = this.index(this.depth);
        let dOff = this.pos - this.path[this.path.length - 1];
        if (dOff)
            return this.parent.child(index).cut(0, dOff);
        return index == 0 ? null : this.parent.child(index - 1);
    }
    /**
    Get the position at the given index in the parent node at the
    given depth (which defaults to `this.depth`).
    */
    posAtIndex(index, depth) {
        depth = this.resolveDepth(depth);
        let node = this.path[depth * 3], pos = depth == 0 ? 0 : this.path[depth * 3 - 1] + 1;
        for (let i = 0; i < index; i++)
            pos += node.child(i).nodeSize;
        return pos;
    }
    /**
    Get the marks at this position, factoring in the surrounding
    marks' [`inclusive`](https://prosemirror.net/docs/ref/#model.MarkSpec.inclusive) property. If the
    position is at the start of a non-empty node, the marks of the
    node after it (if any) are returned.
    */
    marks() {
        let parent = this.parent, index = this.index();
        // In an empty parent, return the empty array
        if (parent.content.size == 0)
            return Mark.none;
        // When inside a text node, just return the text node's marks
        if (this.textOffset)
            return parent.child(index).marks;
        let main = parent.maybeChild(index - 1), other = parent.maybeChild(index);
        // If the `after` flag is true of there is no node before, make
        // the node after this position the main reference.
        if (!main) {
            let tmp = main;
            main = other;
            other = tmp;
        }
        // Use all marks in the main node, except those that have
        // `inclusive` set to false and are not present in the other node.
        let marks = main.marks;
        for (var i = 0; i < marks.length; i++)
            if (marks[i].type.spec.inclusive === false && (!other || !marks[i].isInSet(other.marks)))
                marks = marks[i--].removeFromSet(marks);
        return marks;
    }
    /**
    Get the marks after the current position, if any, except those
    that are non-inclusive and not present at position `$end`. This
    is mostly useful for getting the set of marks to preserve after a
    deletion. Will return `null` if this position is at the end of
    its parent node or its parent node isn't a textblock (in which
    case no marks should be preserved).
    */
    marksAcross($end) {
        let after = this.parent.maybeChild(this.index());
        if (!after || !after.isInline)
            return null;
        let marks = after.marks, next = $end.parent.maybeChild($end.index());
        for (var i = 0; i < marks.length; i++)
            if (marks[i].type.spec.inclusive === false && (!next || !marks[i].isInSet(next.marks)))
                marks = marks[i--].removeFromSet(marks);
        return marks;
    }
    /**
    The depth up to which this position and the given (non-resolved)
    position share the same parent nodes.
    */
    sharedDepth(pos) {
        for (let depth = this.depth; depth > 0; depth--)
            if (this.start(depth) <= pos && this.end(depth) >= pos)
                return depth;
        return 0;
    }
    /**
    Returns a range based on the place where this position and the
    given position diverge around block content. If both point into
    the same textblock, for example, a range around that textblock
    will be returned. If they point into different blocks, the range
    around those blocks in their shared ancestor is returned. You can
    pass in an optional predicate that will be called with a parent
    node to see if a range into that parent is acceptable.
    */
    blockRange(other = this, pred) {
        if (other.pos < this.pos)
            return other.blockRange(this);
        for (let d = this.depth - (this.parent.inlineContent || this.pos == other.pos ? 1 : 0); d >= 0; d--)
            if (other.pos <= this.end(d) && (!pred || pred(this.node(d))))
                return new NodeRange(this, other, d);
        return null;
    }
    /**
    Query whether the given position shares the same parent node.
    */
    sameParent(other) {
        return this.pos - this.parentOffset == other.pos - other.parentOffset;
    }
    /**
    Return the greater of this and the given position.
    */
    max(other) {
        return other.pos > this.pos ? other : this;
    }
    /**
    Return the smaller of this and the given position.
    */
    min(other) {
        return other.pos < this.pos ? other : this;
    }
    /**
    @internal
    */
    toString() {
        let str = "";
        for (let i = 1; i <= this.depth; i++)
            str += (str ? "/" : "") + this.node(i).type.name + "_" + this.index(i - 1);
        return str + ":" + this.parentOffset;
    }
    /**
    @internal
    */
    static resolve(doc, pos) {
        if (!(pos >= 0 && pos <= doc.content.size))
            throw new RangeError("Position " + pos + " out of range");
        let path = [];
        let start = 0, parentOffset = pos;
        for (let node = doc;;) {
            let { index, offset } = node.content.findIndex(parentOffset);
            let rem = parentOffset - offset;
            path.push(node, index, start + offset);
            if (!rem)
                break;
            node = node.child(index);
            if (node.isText)
                break;
            parentOffset = rem - 1;
            start += offset + 1;
        }
        return new ResolvedPos(pos, path, parentOffset);
    }
    /**
    @internal
    */
    static resolveCached(doc, pos) {
        for (let i = 0; i < resolveCache.length; i++) {
            let cached = resolveCache[i];
            if (cached.pos == pos && cached.doc == doc)
                return cached;
        }
        let result = resolveCache[resolveCachePos] = ResolvedPos.resolve(doc, pos);
        resolveCachePos = (resolveCachePos + 1) % resolveCacheSize;
        return result;
    }
}
let resolveCache = [], resolveCachePos = 0, resolveCacheSize = 12;
/**
Represents a flat range of content, i.e. one that starts and
ends in the same node.
*/
class NodeRange {
    /**
    Construct a node range. `$from` and `$to` should point into the
    same node until at least the given `depth`, since a node range
    denotes an adjacent set of nodes in a single parent node.
    */
    constructor(
    /**
    A resolved position along the start of the content. May have a
    `depth` greater than this object's `depth` property, since
    these are the positions that were used to compute the range,
    not re-resolved positions directly at its boundaries.
    */
    $from, 
    /**
    A position along the end of the content. See
    caveat for [`$from`](https://prosemirror.net/docs/ref/#model.NodeRange.$from).
    */
    $to, 
    /**
    The depth of the node that this range points into.
    */
    depth) {
        this.$from = $from;
        this.$to = $to;
        this.depth = depth;
    }
    /**
    The position at the start of the range.
    */
    get start() { return this.$from.before(this.depth + 1); }
    /**
    The position at the end of the range.
    */
    get end() { return this.$to.after(this.depth + 1); }
    /**
    The parent node that the range points into.
    */
    get parent() { return this.$from.node(this.depth); }
    /**
    The start index of the range in the parent node.
    */
    get startIndex() { return this.$from.index(this.depth); }
    /**
    The end index of the range in the parent node.
    */
    get endIndex() { return this.$to.indexAfter(this.depth); }
}

const emptyAttrs = Object.create(null);
/**
This class represents a node in the tree that makes up a
ProseMirror document. So a document is an instance of `Node`, with
children that are also instances of `Node`.

Nodes are persistent data structures. Instead of changing them, you
create new ones with the content you want. Old ones keep pointing
at the old document shape. This is made cheaper by sharing
structure between the old and new data as much as possible, which a
tree shape like this (without back pointers) makes easy.

**Do not** directly mutate the properties of a `Node` object. See
[the guide](/docs/guide/#doc) for more information.
*/
class Node {
    /**
    @internal
    */
    constructor(
    /**
    The type of node that this is.
    */
    type, 
    /**
    An object mapping attribute names to values. The kind of
    attributes allowed and required are
    [determined](https://prosemirror.net/docs/ref/#model.NodeSpec.attrs) by the node type.
    */
    attrs, 
    // A fragment holding the node's children.
    content, 
    /**
    The marks (things like whether it is emphasized or part of a
    link) applied to this node.
    */
    marks = Mark.none) {
        this.type = type;
        this.attrs = attrs;
        this.marks = marks;
        this.content = content || Fragment.empty;
    }
    /**
    The size of this node, as defined by the integer-based [indexing
    scheme](/docs/guide/#doc.indexing). For text nodes, this is the
    amount of characters. For other leaf nodes, it is one. For
    non-leaf nodes, it is the size of the content plus two (the
    start and end token).
    */
    get nodeSize() { return this.isLeaf ? 1 : 2 + this.content.size; }
    /**
    The number of children that the node has.
    */
    get childCount() { return this.content.childCount; }
    /**
    Get the child node at the given index. Raises an error when the
    index is out of range.
    */
    child(index) { return this.content.child(index); }
    /**
    Get the child node at the given index, if it exists.
    */
    maybeChild(index) { return this.content.maybeChild(index); }
    /**
    Call `f` for every child node, passing the node, its offset
    into this parent node, and its index.
    */
    forEach(f) { this.content.forEach(f); }
    /**
    Invoke a callback for all descendant nodes recursively between
    the given two positions that are relative to start of this
    node's content. The callback is invoked with the node, its
    position relative to the original node (method receiver),
    its parent node, and its child index. When the callback returns
    false for a given node, that node's children will not be
    recursed over. The last parameter can be used to specify a
    starting position to count from.
    */
    nodesBetween(from, to, f, startPos = 0) {
        this.content.nodesBetween(from, to, f, startPos, this);
    }
    /**
    Call the given callback for every descendant node. Doesn't
    descend into a node when the callback returns `false`.
    */
    descendants(f) {
        this.nodesBetween(0, this.content.size, f);
    }
    /**
    Concatenates all the text nodes found in this fragment and its
    children.
    */
    get textContent() {
        return (this.isLeaf && this.type.spec.leafText)
            ? this.type.spec.leafText(this)
            : this.textBetween(0, this.content.size, "");
    }
    /**
    Get all text between positions `from` and `to`. When
    `blockSeparator` is given, it will be inserted to separate text
    from different block nodes. If `leafText` is given, it'll be
    inserted for every non-text leaf node encountered, otherwise
    [`leafText`](https://prosemirror.net/docs/ref/#model.NodeSpec^leafText) will be used.
    */
    textBetween(from, to, blockSeparator, leafText) {
        return this.content.textBetween(from, to, blockSeparator, leafText);
    }
    /**
    Returns this node's first child, or `null` if there are no
    children.
    */
    get firstChild() { return this.content.firstChild; }
    /**
    Returns this node's last child, or `null` if there are no
    children.
    */
    get lastChild() { return this.content.lastChild; }
    /**
    Test whether two nodes represent the same piece of document.
    */
    eq(other) {
        return this == other || (this.sameMarkup(other) && this.content.eq(other.content));
    }
    /**
    Compare the markup (type, attributes, and marks) of this node to
    those of another. Returns `true` if both have the same markup.
    */
    sameMarkup(other) {
        return this.hasMarkup(other.type, other.attrs, other.marks);
    }
    /**
    Check whether this node's markup correspond to the given type,
    attributes, and marks.
    */
    hasMarkup(type, attrs, marks) {
        return this.type == type &&
            compareDeep(this.attrs, attrs || type.defaultAttrs || emptyAttrs) &&
            Mark.sameSet(this.marks, marks || Mark.none);
    }
    /**
    Create a new node with the same markup as this node, containing
    the given content (or empty, if no content is given).
    */
    copy(content = null) {
        if (content == this.content)
            return this;
        return new Node(this.type, this.attrs, content, this.marks);
    }
    /**
    Create a copy of this node, with the given set of marks instead
    of the node's own marks.
    */
    mark(marks) {
        return marks == this.marks ? this : new Node(this.type, this.attrs, this.content, marks);
    }
    /**
    Create a copy of this node with only the content between the
    given positions. If `to` is not given, it defaults to the end of
    the node.
    */
    cut(from, to = this.content.size) {
        if (from == 0 && to == this.content.size)
            return this;
        return this.copy(this.content.cut(from, to));
    }
    /**
    Cut out the part of the document between the given positions, and
    return it as a `Slice` object.
    */
    slice(from, to = this.content.size, includeParents = false) {
        if (from == to)
            return Slice.empty;
        let $from = this.resolve(from), $to = this.resolve(to);
        let depth = includeParents ? 0 : $from.sharedDepth(to);
        let start = $from.start(depth), node = $from.node(depth);
        let content = node.content.cut($from.pos - start, $to.pos - start);
        return new Slice(content, $from.depth - depth, $to.depth - depth);
    }
    /**
    Replace the part of the document between the given positions with
    the given slice. The slice must 'fit', meaning its open sides
    must be able to connect to the surrounding content, and its
    content nodes must be valid children for the node they are placed
    into. If any of this is violated, an error of type
    [`ReplaceError`](https://prosemirror.net/docs/ref/#model.ReplaceError) is thrown.
    */
    replace(from, to, slice) {
        return replace(this.resolve(from), this.resolve(to), slice);
    }
    /**
    Find the node directly after the given position.
    */
    nodeAt(pos) {
        for (let node = this;;) {
            let { index, offset } = node.content.findIndex(pos);
            node = node.maybeChild(index);
            if (!node)
                return null;
            if (offset == pos || node.isText)
                return node;
            pos -= offset + 1;
        }
    }
    /**
    Find the (direct) child node after the given offset, if any,
    and return it along with its index and offset relative to this
    node.
    */
    childAfter(pos) {
        let { index, offset } = this.content.findIndex(pos);
        return { node: this.content.maybeChild(index), index, offset };
    }
    /**
    Find the (direct) child node before the given offset, if any,
    and return it along with its index and offset relative to this
    node.
    */
    childBefore(pos) {
        if (pos == 0)
            return { node: null, index: 0, offset: 0 };
        let { index, offset } = this.content.findIndex(pos);
        if (offset < pos)
            return { node: this.content.child(index), index, offset };
        let node = this.content.child(index - 1);
        return { node, index: index - 1, offset: offset - node.nodeSize };
    }
    /**
    Resolve the given position in the document, returning an
    [object](https://prosemirror.net/docs/ref/#model.ResolvedPos) with information about its context.
    */
    resolve(pos) { return ResolvedPos.resolveCached(this, pos); }
    /**
    @internal
    */
    resolveNoCache(pos) { return ResolvedPos.resolve(this, pos); }
    /**
    Test whether a given mark or mark type occurs in this document
    between the two given positions.
    */
    rangeHasMark(from, to, type) {
        let found = false;
        if (to > from)
            this.nodesBetween(from, to, node => {
                if (type.isInSet(node.marks))
                    found = true;
                return !found;
            });
        return found;
    }
    /**
    True when this is a block (non-inline node)
    */
    get isBlock() { return this.type.isBlock; }
    /**
    True when this is a textblock node, a block node with inline
    content.
    */
    get isTextblock() { return this.type.isTextblock; }
    /**
    True when this node allows inline content.
    */
    get inlineContent() { return this.type.inlineContent; }
    /**
    True when this is an inline node (a text node or a node that can
    appear among text).
    */
    get isInline() { return this.type.isInline; }
    /**
    True when this is a text node.
    */
    get isText() { return this.type.isText; }
    /**
    True when this is a leaf node.
    */
    get isLeaf() { return this.type.isLeaf; }
    /**
    True when this is an atom, i.e. when it does not have directly
    editable content. This is usually the same as `isLeaf`, but can
    be configured with the [`atom` property](https://prosemirror.net/docs/ref/#model.NodeSpec.atom)
    on a node's spec (typically used when the node is displayed as
    an uneditable [node view](https://prosemirror.net/docs/ref/#view.NodeView)).
    */
    get isAtom() { return this.type.isAtom; }
    /**
    Return a string representation of this node for debugging
    purposes.
    */
    toString() {
        if (this.type.spec.toDebugString)
            return this.type.spec.toDebugString(this);
        let name = this.type.name;
        if (this.content.size)
            name += "(" + this.content.toStringInner() + ")";
        return wrapMarks(this.marks, name);
    }
    /**
    Get the content match in this node at the given index.
    */
    contentMatchAt(index) {
        let match = this.type.contentMatch.matchFragment(this.content, 0, index);
        if (!match)
            throw new Error("Called contentMatchAt on a node with invalid content");
        return match;
    }
    /**
    Test whether replacing the range between `from` and `to` (by
    child index) with the given replacement fragment (which defaults
    to the empty fragment) would leave the node's content valid. You
    can optionally pass `start` and `end` indices into the
    replacement fragment.
    */
    canReplace(from, to, replacement = Fragment.empty, start = 0, end = replacement.childCount) {
        let one = this.contentMatchAt(from).matchFragment(replacement, start, end);
        let two = one && one.matchFragment(this.content, to);
        if (!two || !two.validEnd)
            return false;
        for (let i = start; i < end; i++)
            if (!this.type.allowsMarks(replacement.child(i).marks))
                return false;
        return true;
    }
    /**
    Test whether replacing the range `from` to `to` (by index) with
    a node of the given type would leave the node's content valid.
    */
    canReplaceWith(from, to, type, marks) {
        if (marks && !this.type.allowsMarks(marks))
            return false;
        let start = this.contentMatchAt(from).matchType(type);
        let end = start && start.matchFragment(this.content, to);
        return end ? end.validEnd : false;
    }
    /**
    Test whether the given node's content could be appended to this
    node. If that node is empty, this will only return true if there
    is at least one node type that can appear in both nodes (to avoid
    merging completely incompatible nodes).
    */
    canAppend(other) {
        if (other.content.size)
            return this.canReplace(this.childCount, this.childCount, other.content);
        else
            return this.type.compatibleContent(other.type);
    }
    /**
    Check whether this node and its descendants conform to the
    schema, and raise error when they do not.
    */
    check() {
        this.type.checkContent(this.content);
        let copy = Mark.none;
        for (let i = 0; i < this.marks.length; i++)
            copy = this.marks[i].addToSet(copy);
        if (!Mark.sameSet(copy, this.marks))
            throw new RangeError(`Invalid collection of marks for node ${this.type.name}: ${this.marks.map(m => m.type.name)}`);
        this.content.forEach(node => node.check());
    }
    /**
    Return a JSON-serializeable representation of this node.
    */
    toJSON() {
        let obj = { type: this.type.name };
        for (let _ in this.attrs) {
            obj.attrs = this.attrs;
            break;
        }
        if (this.content.size)
            obj.content = this.content.toJSON();
        if (this.marks.length)
            obj.marks = this.marks.map(n => n.toJSON());
        return obj;
    }
    /**
    Deserialize a node from its JSON representation.
    */
    static fromJSON(schema, json) {
        if (!json)
            throw new RangeError("Invalid input for Node.fromJSON");
        let marks = null;
        if (json.marks) {
            if (!Array.isArray(json.marks))
                throw new RangeError("Invalid mark data for Node.fromJSON");
            marks = json.marks.map(schema.markFromJSON);
        }
        if (json.type == "text") {
            if (typeof json.text != "string")
                throw new RangeError("Invalid text node in JSON");
            return schema.text(json.text, marks);
        }
        let content = Fragment.fromJSON(schema, json.content);
        return schema.nodeType(json.type).create(json.attrs, content, marks);
    }
}
Node.prototype.text = undefined;
class TextNode extends Node {
    /**
    @internal
    */
    constructor(type, attrs, content, marks) {
        super(type, attrs, null, marks);
        if (!content)
            throw new RangeError("Empty text nodes are not allowed");
        this.text = content;
    }
    toString() {
        if (this.type.spec.toDebugString)
            return this.type.spec.toDebugString(this);
        return wrapMarks(this.marks, JSON.stringify(this.text));
    }
    get textContent() { return this.text; }
    textBetween(from, to) { return this.text.slice(from, to); }
    get nodeSize() { return this.text.length; }
    mark(marks) {
        return marks == this.marks ? this : new TextNode(this.type, this.attrs, this.text, marks);
    }
    withText(text) {
        if (text == this.text)
            return this;
        return new TextNode(this.type, this.attrs, text, this.marks);
    }
    cut(from = 0, to = this.text.length) {
        if (from == 0 && to == this.text.length)
            return this;
        return this.withText(this.text.slice(from, to));
    }
    eq(other) {
        return this.sameMarkup(other) && this.text == other.text;
    }
    toJSON() {
        let base = super.toJSON();
        base.text = this.text;
        return base;
    }
}
function wrapMarks(marks, str) {
    for (let i = marks.length - 1; i >= 0; i--)
        str = marks[i].type.name + "(" + str + ")";
    return str;
}

/**
Instances of this class represent a match state of a node type's
[content expression](https://prosemirror.net/docs/ref/#model.NodeSpec.content), and can be used to
find out whether further content matches here, and whether a given
position is a valid end of the node.
*/
class ContentMatch {
    /**
    @internal
    */
    constructor(
    /**
    True when this match state represents a valid end of the node.
    */
    validEnd) {
        this.validEnd = validEnd;
        /**
        @internal
        */
        this.next = [];
        /**
        @internal
        */
        this.wrapCache = [];
    }
    /**
    @internal
    */
    static parse(string, nodeTypes) {
        let stream = new TokenStream(string, nodeTypes);
        if (stream.next == null)
            return ContentMatch.empty;
        let expr = parseExpr(stream);
        if (stream.next)
            stream.err("Unexpected trailing text");
        let match = dfa(nfa(expr));
        checkForDeadEnds(match, stream);
        return match;
    }
    /**
    Match a node type, returning a match after that node if
    successful.
    */
    matchType(type) {
        for (let i = 0; i < this.next.length; i++)
            if (this.next[i].type == type)
                return this.next[i].next;
        return null;
    }
    /**
    Try to match a fragment. Returns the resulting match when
    successful.
    */
    matchFragment(frag, start = 0, end = frag.childCount) {
        let cur = this;
        for (let i = start; cur && i < end; i++)
            cur = cur.matchType(frag.child(i).type);
        return cur;
    }
    /**
    @internal
    */
    get inlineContent() {
        return this.next.length != 0 && this.next[0].type.isInline;
    }
    /**
    Get the first matching node type at this match position that can
    be generated.
    */
    get defaultType() {
        for (let i = 0; i < this.next.length; i++) {
            let { type } = this.next[i];
            if (!(type.isText || type.hasRequiredAttrs()))
                return type;
        }
        return null;
    }
    /**
    @internal
    */
    compatible(other) {
        for (let i = 0; i < this.next.length; i++)
            for (let j = 0; j < other.next.length; j++)
                if (this.next[i].type == other.next[j].type)
                    return true;
        return false;
    }
    /**
    Try to match the given fragment, and if that fails, see if it can
    be made to match by inserting nodes in front of it. When
    successful, return a fragment of inserted nodes (which may be
    empty if nothing had to be inserted). When `toEnd` is true, only
    return a fragment if the resulting match goes to the end of the
    content expression.
    */
    fillBefore(after, toEnd = false, startIndex = 0) {
        let seen = [this];
        function search(match, types) {
            let finished = match.matchFragment(after, startIndex);
            if (finished && (!toEnd || finished.validEnd))
                return Fragment.from(types.map(tp => tp.createAndFill()));
            for (let i = 0; i < match.next.length; i++) {
                let { type, next } = match.next[i];
                if (!(type.isText || type.hasRequiredAttrs()) && seen.indexOf(next) == -1) {
                    seen.push(next);
                    let found = search(next, types.concat(type));
                    if (found)
                        return found;
                }
            }
            return null;
        }
        return search(this, []);
    }
    /**
    Find a set of wrapping node types that would allow a node of the
    given type to appear at this position. The result may be empty
    (when it fits directly) and will be null when no such wrapping
    exists.
    */
    findWrapping(target) {
        for (let i = 0; i < this.wrapCache.length; i += 2)
            if (this.wrapCache[i] == target)
                return this.wrapCache[i + 1];
        let computed = this.computeWrapping(target);
        this.wrapCache.push(target, computed);
        return computed;
    }
    /**
    @internal
    */
    computeWrapping(target) {
        let seen = Object.create(null), active = [{ match: this, type: null, via: null }];
        while (active.length) {
            let current = active.shift(), match = current.match;
            if (match.matchType(target)) {
                let result = [];
                for (let obj = current; obj.type; obj = obj.via)
                    result.push(obj.type);
                return result.reverse();
            }
            for (let i = 0; i < match.next.length; i++) {
                let { type, next } = match.next[i];
                if (!type.isLeaf && !type.hasRequiredAttrs() && !(type.name in seen) && (!current.type || next.validEnd)) {
                    active.push({ match: type.contentMatch, type, via: current });
                    seen[type.name] = true;
                }
            }
        }
        return null;
    }
    /**
    The number of outgoing edges this node has in the finite
    automaton that describes the content expression.
    */
    get edgeCount() {
        return this.next.length;
    }
    /**
    Get the _n_​th outgoing edge from this node in the finite
    automaton that describes the content expression.
    */
    edge(n) {
        if (n >= this.next.length)
            throw new RangeError(`There's no ${n}th edge in this content match`);
        return this.next[n];
    }
    /**
    @internal
    */
    toString() {
        let seen = [];
        function scan(m) {
            seen.push(m);
            for (let i = 0; i < m.next.length; i++)
                if (seen.indexOf(m.next[i].next) == -1)
                    scan(m.next[i].next);
        }
        scan(this);
        return seen.map((m, i) => {
            let out = i + (m.validEnd ? "*" : " ") + " ";
            for (let i = 0; i < m.next.length; i++)
                out += (i ? ", " : "") + m.next[i].type.name + "->" + seen.indexOf(m.next[i].next);
            return out;
        }).join("\n");
    }
}
/**
@internal
*/
ContentMatch.empty = new ContentMatch(true);
class TokenStream {
    constructor(string, nodeTypes) {
        this.string = string;
        this.nodeTypes = nodeTypes;
        this.inline = null;
        this.pos = 0;
        this.tokens = string.split(/\s*(?=\b|\W|$)/);
        if (this.tokens[this.tokens.length - 1] == "")
            this.tokens.pop();
        if (this.tokens[0] == "")
            this.tokens.shift();
    }
    get next() { return this.tokens[this.pos]; }
    eat(tok) { return this.next == tok && (this.pos++ || true); }
    err(str) { throw new SyntaxError(str + " (in content expression '" + this.string + "')"); }
}
function parseExpr(stream) {
    let exprs = [];
    do {
        exprs.push(parseExprSeq(stream));
    } while (stream.eat("|"));
    return exprs.length == 1 ? exprs[0] : { type: "choice", exprs };
}
function parseExprSeq(stream) {
    let exprs = [];
    do {
        exprs.push(parseExprSubscript(stream));
    } while (stream.next && stream.next != ")" && stream.next != "|");
    return exprs.length == 1 ? exprs[0] : { type: "seq", exprs };
}
function parseExprSubscript(stream) {
    let expr = parseExprAtom(stream);
    for (;;) {
        if (stream.eat("+"))
            expr = { type: "plus", expr };
        else if (stream.eat("*"))
            expr = { type: "star", expr };
        else if (stream.eat("?"))
            expr = { type: "opt", expr };
        else if (stream.eat("{"))
            expr = parseExprRange(stream, expr);
        else
            break;
    }
    return expr;
}
function parseNum(stream) {
    if (/\D/.test(stream.next))
        stream.err("Expected number, got '" + stream.next + "'");
    let result = Number(stream.next);
    stream.pos++;
    return result;
}
function parseExprRange(stream, expr) {
    let min = parseNum(stream), max = min;
    if (stream.eat(",")) {
        if (stream.next != "}")
            max = parseNum(stream);
        else
            max = -1;
    }
    if (!stream.eat("}"))
        stream.err("Unclosed braced range");
    return { type: "range", min, max, expr };
}
function resolveName(stream, name) {
    let types = stream.nodeTypes, type = types[name];
    if (type)
        return [type];
    let result = [];
    for (let typeName in types) {
        let type = types[typeName];
        if (type.groups.indexOf(name) > -1)
            result.push(type);
    }
    if (result.length == 0)
        stream.err("No node type or group '" + name + "' found");
    return result;
}
function parseExprAtom(stream) {
    if (stream.eat("(")) {
        let expr = parseExpr(stream);
        if (!stream.eat(")"))
            stream.err("Missing closing paren");
        return expr;
    }
    else if (!/\W/.test(stream.next)) {
        let exprs = resolveName(stream, stream.next).map(type => {
            if (stream.inline == null)
                stream.inline = type.isInline;
            else if (stream.inline != type.isInline)
                stream.err("Mixing inline and block content");
            return { type: "name", value: type };
        });
        stream.pos++;
        return exprs.length == 1 ? exprs[0] : { type: "choice", exprs };
    }
    else {
        stream.err("Unexpected token '" + stream.next + "'");
    }
}
/**
Construct an NFA from an expression as returned by the parser. The
NFA is represented as an array of states, which are themselves
arrays of edges, which are `{term, to}` objects. The first state is
the entry state and the last node is the success state.

Note that unlike typical NFAs, the edge ordering in this one is
significant, in that it is used to contruct filler content when
necessary.
*/
function nfa(expr) {
    let nfa = [[]];
    connect(compile(expr, 0), node());
    return nfa;
    function node() { return nfa.push([]) - 1; }
    function edge(from, to, term) {
        let edge = { term, to };
        nfa[from].push(edge);
        return edge;
    }
    function connect(edges, to) {
        edges.forEach(edge => edge.to = to);
    }
    function compile(expr, from) {
        if (expr.type == "choice") {
            return expr.exprs.reduce((out, expr) => out.concat(compile(expr, from)), []);
        }
        else if (expr.type == "seq") {
            for (let i = 0;; i++) {
                let next = compile(expr.exprs[i], from);
                if (i == expr.exprs.length - 1)
                    return next;
                connect(next, from = node());
            }
        }
        else if (expr.type == "star") {
            let loop = node();
            edge(from, loop);
            connect(compile(expr.expr, loop), loop);
            return [edge(loop)];
        }
        else if (expr.type == "plus") {
            let loop = node();
            connect(compile(expr.expr, from), loop);
            connect(compile(expr.expr, loop), loop);
            return [edge(loop)];
        }
        else if (expr.type == "opt") {
            return [edge(from)].concat(compile(expr.expr, from));
        }
        else if (expr.type == "range") {
            let cur = from;
            for (let i = 0; i < expr.min; i++) {
                let next = node();
                connect(compile(expr.expr, cur), next);
                cur = next;
            }
            if (expr.max == -1) {
                connect(compile(expr.expr, cur), cur);
            }
            else {
                for (let i = expr.min; i < expr.max; i++) {
                    let next = node();
                    edge(cur, next);
                    connect(compile(expr.expr, cur), next);
                    cur = next;
                }
            }
            return [edge(cur)];
        }
        else if (expr.type == "name") {
            return [edge(from, undefined, expr.value)];
        }
        else {
            throw new Error("Unknown expr type");
        }
    }
}
function cmp(a, b) { return b - a; }
// Get the set of nodes reachable by null edges from `node`. Omit
// nodes with only a single null-out-edge, since they may lead to
// needless duplicated nodes.
function nullFrom(nfa, node) {
    let result = [];
    scan(node);
    return result.sort(cmp);
    function scan(node) {
        let edges = nfa[node];
        if (edges.length == 1 && !edges[0].term)
            return scan(edges[0].to);
        result.push(node);
        for (let i = 0; i < edges.length; i++) {
            let { term, to } = edges[i];
            if (!term && result.indexOf(to) == -1)
                scan(to);
        }
    }
}
// Compiles an NFA as produced by `nfa` into a DFA, modeled as a set
// of state objects (`ContentMatch` instances) with transitions
// between them.
function dfa(nfa) {
    let labeled = Object.create(null);
    return explore(nullFrom(nfa, 0));
    function explore(states) {
        let out = [];
        states.forEach(node => {
            nfa[node].forEach(({ term, to }) => {
                if (!term)
                    return;
                let set;
                for (let i = 0; i < out.length; i++)
                    if (out[i][0] == term)
                        set = out[i][1];
                nullFrom(nfa, to).forEach(node => {
                    if (!set)
                        out.push([term, set = []]);
                    if (set.indexOf(node) == -1)
                        set.push(node);
                });
            });
        });
        let state = labeled[states.join(",")] = new ContentMatch(states.indexOf(nfa.length - 1) > -1);
        for (let i = 0; i < out.length; i++) {
            let states = out[i][1].sort(cmp);
            state.next.push({ type: out[i][0], next: labeled[states.join(",")] || explore(states) });
        }
        return state;
    }
}
function checkForDeadEnds(match, stream) {
    for (let i = 0, work = [match]; i < work.length; i++) {
        let state = work[i], dead = !state.validEnd, nodes = [];
        for (let j = 0; j < state.next.length; j++) {
            let { type, next } = state.next[j];
            nodes.push(type.name);
            if (dead && !(type.isText || type.hasRequiredAttrs()))
                dead = false;
            if (work.indexOf(next) == -1)
                work.push(next);
        }
        if (dead)
            stream.err("Only non-generatable nodes (" + nodes.join(", ") + ") in a required position (see https://prosemirror.net/docs/guide/#generatable)");
    }
}

// For node types where all attrs have a default value (or which don't
// have any attributes), build up a single reusable default attribute
// object, and use it for all nodes that don't specify specific
// attributes.
function defaultAttrs(attrs) {
    let defaults = Object.create(null);
    for (let attrName in attrs) {
        let attr = attrs[attrName];
        if (!attr.hasDefault)
            return null;
        defaults[attrName] = attr.default;
    }
    return defaults;
}
function computeAttrs(attrs, value) {
    let built = Object.create(null);
    for (let name in attrs) {
        let given = value && value[name];
        if (given === undefined) {
            let attr = attrs[name];
            if (attr.hasDefault)
                given = attr.default;
            else
                throw new RangeError("No value supplied for attribute " + name);
        }
        built[name] = given;
    }
    return built;
}
function initAttrs(attrs) {
    let result = Object.create(null);
    if (attrs)
        for (let name in attrs)
            result[name] = new Attribute(attrs[name]);
    return result;
}
/**
Node types are objects allocated once per `Schema` and used to
[tag](https://prosemirror.net/docs/ref/#model.Node.type) `Node` instances. They contain information
about the node type, such as its name and what kind of node it
represents.
*/
class NodeType {
    /**
    @internal
    */
    constructor(
    /**
    The name the node type has in this schema.
    */
    name, 
    /**
    A link back to the `Schema` the node type belongs to.
    */
    schema, 
    /**
    The spec that this type is based on
    */
    spec) {
        this.name = name;
        this.schema = schema;
        this.spec = spec;
        /**
        The set of marks allowed in this node. `null` means all marks
        are allowed.
        */
        this.markSet = null;
        this.groups = spec.group ? spec.group.split(" ") : [];
        this.attrs = initAttrs(spec.attrs);
        this.defaultAttrs = defaultAttrs(this.attrs);
        this.contentMatch = null;
        this.inlineContent = null;
        this.isBlock = !(spec.inline || name == "text");
        this.isText = name == "text";
    }
    /**
    True if this is an inline type.
    */
    get isInline() { return !this.isBlock; }
    /**
    True if this is a textblock type, a block that contains inline
    content.
    */
    get isTextblock() { return this.isBlock && this.inlineContent; }
    /**
    True for node types that allow no content.
    */
    get isLeaf() { return this.contentMatch == ContentMatch.empty; }
    /**
    True when this node is an atom, i.e. when it does not have
    directly editable content.
    */
    get isAtom() { return this.isLeaf || !!this.spec.atom; }
    /**
    The node type's [whitespace](https://prosemirror.net/docs/ref/#model.NodeSpec.whitespace) option.
    */
    get whitespace() {
        return this.spec.whitespace || (this.spec.code ? "pre" : "normal");
    }
    /**
    Tells you whether this node type has any required attributes.
    */
    hasRequiredAttrs() {
        for (let n in this.attrs)
            if (this.attrs[n].isRequired)
                return true;
        return false;
    }
    /**
    Indicates whether this node allows some of the same content as
    the given node type.
    */
    compatibleContent(other) {
        return this == other || this.contentMatch.compatible(other.contentMatch);
    }
    /**
    @internal
    */
    computeAttrs(attrs) {
        if (!attrs && this.defaultAttrs)
            return this.defaultAttrs;
        else
            return computeAttrs(this.attrs, attrs);
    }
    /**
    Create a `Node` of this type. The given attributes are
    checked and defaulted (you can pass `null` to use the type's
    defaults entirely, if no required attributes exist). `content`
    may be a `Fragment`, a node, an array of nodes, or
    `null`. Similarly `marks` may be `null` to default to the empty
    set of marks.
    */
    create(attrs = null, content, marks) {
        if (this.isText)
            throw new Error("NodeType.create can't construct text nodes");
        return new Node(this, this.computeAttrs(attrs), Fragment.from(content), Mark.setFrom(marks));
    }
    /**
    Like [`create`](https://prosemirror.net/docs/ref/#model.NodeType.create), but check the given content
    against the node type's content restrictions, and throw an error
    if it doesn't match.
    */
    createChecked(attrs = null, content, marks) {
        content = Fragment.from(content);
        this.checkContent(content);
        return new Node(this, this.computeAttrs(attrs), content, Mark.setFrom(marks));
    }
    /**
    Like [`create`](https://prosemirror.net/docs/ref/#model.NodeType.create), but see if it is
    necessary to add nodes to the start or end of the given fragment
    to make it fit the node. If no fitting wrapping can be found,
    return null. Note that, due to the fact that required nodes can
    always be created, this will always succeed if you pass null or
    `Fragment.empty` as content.
    */
    createAndFill(attrs = null, content, marks) {
        attrs = this.computeAttrs(attrs);
        content = Fragment.from(content);
        if (content.size) {
            let before = this.contentMatch.fillBefore(content);
            if (!before)
                return null;
            content = before.append(content);
        }
        let matched = this.contentMatch.matchFragment(content);
        let after = matched && matched.fillBefore(Fragment.empty, true);
        if (!after)
            return null;
        return new Node(this, attrs, content.append(after), Mark.setFrom(marks));
    }
    /**
    Returns true if the given fragment is valid content for this node
    type with the given attributes.
    */
    validContent(content) {
        let result = this.contentMatch.matchFragment(content);
        if (!result || !result.validEnd)
            return false;
        for (let i = 0; i < content.childCount; i++)
            if (!this.allowsMarks(content.child(i).marks))
                return false;
        return true;
    }
    /**
    Throws a RangeError if the given fragment is not valid content for this
    node type.
    @internal
    */
    checkContent(content) {
        if (!this.validContent(content))
            throw new RangeError(`Invalid content for node ${this.name}: ${content.toString().slice(0, 50)}`);
    }
    /**
    Check whether the given mark type is allowed in this node.
    */
    allowsMarkType(markType) {
        return this.markSet == null || this.markSet.indexOf(markType) > -1;
    }
    /**
    Test whether the given set of marks are allowed in this node.
    */
    allowsMarks(marks) {
        if (this.markSet == null)
            return true;
        for (let i = 0; i < marks.length; i++)
            if (!this.allowsMarkType(marks[i].type))
                return false;
        return true;
    }
    /**
    Removes the marks that are not allowed in this node from the given set.
    */
    allowedMarks(marks) {
        if (this.markSet == null)
            return marks;
        let copy;
        for (let i = 0; i < marks.length; i++) {
            if (!this.allowsMarkType(marks[i].type)) {
                if (!copy)
                    copy = marks.slice(0, i);
            }
            else if (copy) {
                copy.push(marks[i]);
            }
        }
        return !copy ? marks : copy.length ? copy : Mark.none;
    }
    /**
    @internal
    */
    static compile(nodes, schema) {
        let result = Object.create(null);
        nodes.forEach((name, spec) => result[name] = new NodeType(name, schema, spec));
        let topType = schema.spec.topNode || "doc";
        if (!result[topType])
            throw new RangeError("Schema is missing its top node type ('" + topType + "')");
        if (!result.text)
            throw new RangeError("Every schema needs a 'text' type");
        for (let _ in result.text.attrs)
            throw new RangeError("The text node type should not have attributes");
        return result;
    }
}
// Attribute descriptors
class Attribute {
    constructor(options) {
        this.hasDefault = Object.prototype.hasOwnProperty.call(options, "default");
        this.default = options.default;
    }
    get isRequired() {
        return !this.hasDefault;
    }
}
// Marks
/**
Like nodes, marks (which are associated with nodes to signify
things like emphasis or being part of a link) are
[tagged](https://prosemirror.net/docs/ref/#model.Mark.type) with type objects, which are
instantiated once per `Schema`.
*/
class MarkType {
    /**
    @internal
    */
    constructor(
    /**
    The name of the mark type.
    */
    name, 
    /**
    @internal
    */
    rank, 
    /**
    The schema that this mark type instance is part of.
    */
    schema, 
    /**
    The spec on which the type is based.
    */
    spec) {
        this.name = name;
        this.rank = rank;
        this.schema = schema;
        this.spec = spec;
        this.attrs = initAttrs(spec.attrs);
        this.excluded = null;
        let defaults = defaultAttrs(this.attrs);
        this.instance = defaults ? new Mark(this, defaults) : null;
    }
    /**
    Create a mark of this type. `attrs` may be `null` or an object
    containing only some of the mark's attributes. The others, if
    they have defaults, will be added.
    */
    create(attrs = null) {
        if (!attrs && this.instance)
            return this.instance;
        return new Mark(this, computeAttrs(this.attrs, attrs));
    }
    /**
    @internal
    */
    static compile(marks, schema) {
        let result = Object.create(null), rank = 0;
        marks.forEach((name, spec) => result[name] = new MarkType(name, rank++, schema, spec));
        return result;
    }
    /**
    When there is a mark of this type in the given set, a new set
    without it is returned. Otherwise, the input set is returned.
    */
    removeFromSet(set) {
        for (var i = 0; i < set.length; i++)
            if (set[i].type == this) {
                set = set.slice(0, i).concat(set.slice(i + 1));
                i--;
            }
        return set;
    }
    /**
    Tests whether there is a mark of this type in the given set.
    */
    isInSet(set) {
        for (let i = 0; i < set.length; i++)
            if (set[i].type == this)
                return set[i];
    }
    /**
    Queries whether a given mark type is
    [excluded](https://prosemirror.net/docs/ref/#model.MarkSpec.excludes) by this one.
    */
    excludes(other) {
        return this.excluded.indexOf(other) > -1;
    }
}
/**
A document schema. Holds [node](https://prosemirror.net/docs/ref/#model.NodeType) and [mark
type](https://prosemirror.net/docs/ref/#model.MarkType) objects for the nodes and marks that may
occur in conforming documents, and provides functionality for
creating and deserializing such documents.

When given, the type parameters provide the names of the nodes and
marks in this schema.
*/
class Schema {
    /**
    Construct a schema from a schema [specification](https://prosemirror.net/docs/ref/#model.SchemaSpec).
    */
    constructor(spec) {
        /**
        An object for storing whatever values modules may want to
        compute and cache per schema. (If you want to store something
        in it, try to use property names unlikely to clash.)
        */
        this.cached = Object.create(null);
        let instanceSpec = this.spec = {};
        for (let prop in spec)
            instanceSpec[prop] = spec[prop];
        instanceSpec.nodes = OrderedMap.from(spec.nodes),
            instanceSpec.marks = OrderedMap.from(spec.marks || {}),
            this.nodes = NodeType.compile(this.spec.nodes, this);
        this.marks = MarkType.compile(this.spec.marks, this);
        let contentExprCache = Object.create(null);
        for (let prop in this.nodes) {
            if (prop in this.marks)
                throw new RangeError(prop + " can not be both a node and a mark");
            let type = this.nodes[prop], contentExpr = type.spec.content || "", markExpr = type.spec.marks;
            type.contentMatch = contentExprCache[contentExpr] ||
                (contentExprCache[contentExpr] = ContentMatch.parse(contentExpr, this.nodes));
            type.inlineContent = type.contentMatch.inlineContent;
            type.markSet = markExpr == "_" ? null :
                markExpr ? gatherMarks(this, markExpr.split(" ")) :
                    markExpr == "" || !type.inlineContent ? [] : null;
        }
        for (let prop in this.marks) {
            let type = this.marks[prop], excl = type.spec.excludes;
            type.excluded = excl == null ? [type] : excl == "" ? [] : gatherMarks(this, excl.split(" "));
        }
        this.nodeFromJSON = this.nodeFromJSON.bind(this);
        this.markFromJSON = this.markFromJSON.bind(this);
        this.topNodeType = this.nodes[this.spec.topNode || "doc"];
        this.cached.wrappings = Object.create(null);
    }
    /**
    Create a node in this schema. The `type` may be a string or a
    `NodeType` instance. Attributes will be extended with defaults,
    `content` may be a `Fragment`, `null`, a `Node`, or an array of
    nodes.
    */
    node(type, attrs = null, content, marks) {
        if (typeof type == "string")
            type = this.nodeType(type);
        else if (!(type instanceof NodeType))
            throw new RangeError("Invalid node type: " + type);
        else if (type.schema != this)
            throw new RangeError("Node type from different schema used (" + type.name + ")");
        return type.createChecked(attrs, content, marks);
    }
    /**
    Create a text node in the schema. Empty text nodes are not
    allowed.
    */
    text(text, marks) {
        let type = this.nodes.text;
        return new TextNode(type, type.defaultAttrs, text, Mark.setFrom(marks));
    }
    /**
    Create a mark with the given type and attributes.
    */
    mark(type, attrs) {
        if (typeof type == "string")
            type = this.marks[type];
        return type.create(attrs);
    }
    /**
    Deserialize a node from its JSON representation. This method is
    bound.
    */
    nodeFromJSON(json) {
        return Node.fromJSON(this, json);
    }
    /**
    Deserialize a mark from its JSON representation. This method is
    bound.
    */
    markFromJSON(json) {
        return Mark.fromJSON(this, json);
    }
    /**
    @internal
    */
    nodeType(name) {
        let found = this.nodes[name];
        if (!found)
            throw new RangeError("Unknown node type: " + name);
        return found;
    }
}
function gatherMarks(schema, marks) {
    let found = [];
    for (let i = 0; i < marks.length; i++) {
        let name = marks[i], mark = schema.marks[name], ok = mark;
        if (mark) {
            found.push(mark);
        }
        else {
            for (let prop in schema.marks) {
                let mark = schema.marks[prop];
                if (name == "_" || (mark.spec.group && mark.spec.group.split(" ").indexOf(name) > -1))
                    found.push(ok = mark);
            }
        }
        if (!ok)
            throw new SyntaxError("Unknown mark type: '" + marks[i] + "'");
    }
    return found;
}

/**
A DOM parser represents a strategy for parsing DOM content into a
ProseMirror document conforming to a given schema. Its behavior is
defined by an array of [rules](https://prosemirror.net/docs/ref/#model.ParseRule).
*/
class DOMParser {
    /**
    Create a parser that targets the given schema, using the given
    parsing rules.
    */
    constructor(
    /**
    The schema into which the parser parses.
    */
    schema, 
    /**
    The set of [parse rules](https://prosemirror.net/docs/ref/#model.ParseRule) that the parser
    uses, in order of precedence.
    */
    rules) {
        this.schema = schema;
        this.rules = rules;
        /**
        @internal
        */
        this.tags = [];
        /**
        @internal
        */
        this.styles = [];
        rules.forEach(rule => {
            if (rule.tag)
                this.tags.push(rule);
            else if (rule.style)
                this.styles.push(rule);
        });
        // Only normalize list elements when lists in the schema can't directly contain themselves
        this.normalizeLists = !this.tags.some(r => {
            if (!/^(ul|ol)\b/.test(r.tag) || !r.node)
                return false;
            let node = schema.nodes[r.node];
            return node.contentMatch.matchType(node);
        });
    }
    /**
    Parse a document from the content of a DOM node.
    */
    parse(dom, options = {}) {
        let context = new ParseContext(this, options, false);
        context.addAll(dom, options.from, options.to);
        return context.finish();
    }
    /**
    Parses the content of the given DOM node, like
    [`parse`](https://prosemirror.net/docs/ref/#model.DOMParser.parse), and takes the same set of
    options. But unlike that method, which produces a whole node,
    this one returns a slice that is open at the sides, meaning that
    the schema constraints aren't applied to the start of nodes to
    the left of the input and the end of nodes at the end.
    */
    parseSlice(dom, options = {}) {
        let context = new ParseContext(this, options, true);
        context.addAll(dom, options.from, options.to);
        return Slice.maxOpen(context.finish());
    }
    /**
    @internal
    */
    matchTag(dom, context, after) {
        for (let i = after ? this.tags.indexOf(after) + 1 : 0; i < this.tags.length; i++) {
            let rule = this.tags[i];
            if (matches(dom, rule.tag) &&
                (rule.namespace === undefined || dom.namespaceURI == rule.namespace) &&
                (!rule.context || context.matchesContext(rule.context))) {
                if (rule.getAttrs) {
                    let result = rule.getAttrs(dom);
                    if (result === false)
                        continue;
                    rule.attrs = result || undefined;
                }
                return rule;
            }
        }
    }
    /**
    @internal
    */
    matchStyle(prop, value, context, after) {
        for (let i = after ? this.styles.indexOf(after) + 1 : 0; i < this.styles.length; i++) {
            let rule = this.styles[i], style = rule.style;
            if (style.indexOf(prop) != 0 ||
                rule.context && !context.matchesContext(rule.context) ||
                // Test that the style string either precisely matches the prop,
                // or has an '=' sign after the prop, followed by the given
                // value.
                style.length > prop.length &&
                    (style.charCodeAt(prop.length) != 61 || style.slice(prop.length + 1) != value))
                continue;
            if (rule.getAttrs) {
                let result = rule.getAttrs(value);
                if (result === false)
                    continue;
                rule.attrs = result || undefined;
            }
            return rule;
        }
    }
    /**
    @internal
    */
    static schemaRules(schema) {
        let result = [];
        function insert(rule) {
            let priority = rule.priority == null ? 50 : rule.priority, i = 0;
            for (; i < result.length; i++) {
                let next = result[i], nextPriority = next.priority == null ? 50 : next.priority;
                if (nextPriority < priority)
                    break;
            }
            result.splice(i, 0, rule);
        }
        for (let name in schema.marks) {
            let rules = schema.marks[name].spec.parseDOM;
            if (rules)
                rules.forEach(rule => {
                    insert(rule = copy(rule));
                    if (!(rule.mark || rule.ignore || rule.clearMark))
                        rule.mark = name;
                });
        }
        for (let name in schema.nodes) {
            let rules = schema.nodes[name].spec.parseDOM;
            if (rules)
                rules.forEach(rule => {
                    insert(rule = copy(rule));
                    if (!(rule.node || rule.ignore || rule.mark))
                        rule.node = name;
                });
        }
        return result;
    }
    /**
    Construct a DOM parser using the parsing rules listed in a
    schema's [node specs](https://prosemirror.net/docs/ref/#model.NodeSpec.parseDOM), reordered by
    [priority](https://prosemirror.net/docs/ref/#model.ParseRule.priority).
    */
    static fromSchema(schema) {
        return schema.cached.domParser ||
            (schema.cached.domParser = new DOMParser(schema, DOMParser.schemaRules(schema)));
    }
}
const blockTags = {
    address: true, article: true, aside: true, blockquote: true, canvas: true,
    dd: true, div: true, dl: true, fieldset: true, figcaption: true, figure: true,
    footer: true, form: true, h1: true, h2: true, h3: true, h4: true, h5: true,
    h6: true, header: true, hgroup: true, hr: true, li: true, noscript: true, ol: true,
    output: true, p: true, pre: true, section: true, table: true, tfoot: true, ul: true
};
const ignoreTags = {
    head: true, noscript: true, object: true, script: true, style: true, title: true
};
const listTags = { ol: true, ul: true };
// Using a bitfield for node context options
const OPT_PRESERVE_WS = 1, OPT_PRESERVE_WS_FULL = 2, OPT_OPEN_LEFT = 4;
function wsOptionsFor(type, preserveWhitespace, base) {
    if (preserveWhitespace != null)
        return (preserveWhitespace ? OPT_PRESERVE_WS : 0) |
            (preserveWhitespace === "full" ? OPT_PRESERVE_WS_FULL : 0);
    return type && type.whitespace == "pre" ? OPT_PRESERVE_WS | OPT_PRESERVE_WS_FULL : base & ~OPT_OPEN_LEFT;
}
class NodeContext {
    constructor(type, attrs, 
    // Marks applied to this node itself
    marks, 
    // Marks that can't apply here, but will be used in children if possible
    pendingMarks, solid, match, options) {
        this.type = type;
        this.attrs = attrs;
        this.marks = marks;
        this.pendingMarks = pendingMarks;
        this.solid = solid;
        this.options = options;
        this.content = [];
        // Marks applied to the node's children
        this.activeMarks = Mark.none;
        // Nested Marks with same type
        this.stashMarks = [];
        this.match = match || (options & OPT_OPEN_LEFT ? null : type.contentMatch);
    }
    findWrapping(node) {
        if (!this.match) {
            if (!this.type)
                return [];
            let fill = this.type.contentMatch.fillBefore(Fragment.from(node));
            if (fill) {
                this.match = this.type.contentMatch.matchFragment(fill);
            }
            else {
                let start = this.type.contentMatch, wrap;
                if (wrap = start.findWrapping(node.type)) {
                    this.match = start;
                    return wrap;
                }
                else {
                    return null;
                }
            }
        }
        return this.match.findWrapping(node.type);
    }
    finish(openEnd) {
        if (!(this.options & OPT_PRESERVE_WS)) { // Strip trailing whitespace
            let last = this.content[this.content.length - 1], m;
            if (last && last.isText && (m = /[ \t\r\n\u000c]+$/.exec(last.text))) {
                let text = last;
                if (last.text.length == m[0].length)
                    this.content.pop();
                else
                    this.content[this.content.length - 1] = text.withText(text.text.slice(0, text.text.length - m[0].length));
            }
        }
        let content = Fragment.from(this.content);
        if (!openEnd && this.match)
            content = content.append(this.match.fillBefore(Fragment.empty, true));
        return this.type ? this.type.create(this.attrs, content, this.marks) : content;
    }
    popFromStashMark(mark) {
        for (let i = this.stashMarks.length - 1; i >= 0; i--)
            if (mark.eq(this.stashMarks[i]))
                return this.stashMarks.splice(i, 1)[0];
    }
    applyPending(nextType) {
        for (let i = 0, pending = this.pendingMarks; i < pending.length; i++) {
            let mark = pending[i];
            if ((this.type ? this.type.allowsMarkType(mark.type) : markMayApply(mark.type, nextType)) &&
                !mark.isInSet(this.activeMarks)) {
                this.activeMarks = mark.addToSet(this.activeMarks);
                this.pendingMarks = mark.removeFromSet(this.pendingMarks);
            }
        }
    }
    inlineContext(node) {
        if (this.type)
            return this.type.inlineContent;
        if (this.content.length)
            return this.content[0].isInline;
        return node.parentNode && !blockTags.hasOwnProperty(node.parentNode.nodeName.toLowerCase());
    }
}
class ParseContext {
    constructor(
    // The parser we are using.
    parser, 
    // The options passed to this parse.
    options, isOpen) {
        this.parser = parser;
        this.options = options;
        this.isOpen = isOpen;
        this.open = 0;
        let topNode = options.topNode, topContext;
        let topOptions = wsOptionsFor(null, options.preserveWhitespace, 0) | (isOpen ? OPT_OPEN_LEFT : 0);
        if (topNode)
            topContext = new NodeContext(topNode.type, topNode.attrs, Mark.none, Mark.none, true, options.topMatch || topNode.type.contentMatch, topOptions);
        else if (isOpen)
            topContext = new NodeContext(null, null, Mark.none, Mark.none, true, null, topOptions);
        else
            topContext = new NodeContext(parser.schema.topNodeType, null, Mark.none, Mark.none, true, null, topOptions);
        this.nodes = [topContext];
        this.find = options.findPositions;
        this.needsBlock = false;
    }
    get top() {
        return this.nodes[this.open];
    }
    // Add a DOM node to the content. Text is inserted as text node,
    // otherwise, the node is passed to `addElement` or, if it has a
    // `style` attribute, `addElementWithStyles`.
    addDOM(dom) {
        if (dom.nodeType == 3)
            this.addTextNode(dom);
        else if (dom.nodeType == 1)
            this.addElement(dom);
    }
    withStyleRules(dom, f) {
        let style = dom.getAttribute("style");
        if (!style)
            return f();
        let marks = this.readStyles(parseStyles(style));
        if (!marks)
            return; // A style with ignore: true
        let [addMarks, removeMarks] = marks, top = this.top;
        for (let i = 0; i < removeMarks.length; i++)
            this.removePendingMark(removeMarks[i], top);
        for (let i = 0; i < addMarks.length; i++)
            this.addPendingMark(addMarks[i]);
        f();
        for (let i = 0; i < addMarks.length; i++)
            this.removePendingMark(addMarks[i], top);
        for (let i = 0; i < removeMarks.length; i++)
            this.addPendingMark(removeMarks[i]);
    }
    addTextNode(dom) {
        let value = dom.nodeValue;
        let top = this.top;
        if (top.options & OPT_PRESERVE_WS_FULL ||
            top.inlineContext(dom) ||
            /[^ \t\r\n\u000c]/.test(value)) {
            if (!(top.options & OPT_PRESERVE_WS)) {
                value = value.replace(/[ \t\r\n\u000c]+/g, " ");
                // If this starts with whitespace, and there is no node before it, or
                // a hard break, or a text node that ends with whitespace, strip the
                // leading space.
                if (/^[ \t\r\n\u000c]/.test(value) && this.open == this.nodes.length - 1) {
                    let nodeBefore = top.content[top.content.length - 1];
                    let domNodeBefore = dom.previousSibling;
                    if (!nodeBefore ||
                        (domNodeBefore && domNodeBefore.nodeName == 'BR') ||
                        (nodeBefore.isText && /[ \t\r\n\u000c]$/.test(nodeBefore.text)))
                        value = value.slice(1);
                }
            }
            else if (!(top.options & OPT_PRESERVE_WS_FULL)) {
                value = value.replace(/\r?\n|\r/g, " ");
            }
            else {
                value = value.replace(/\r\n?/g, "\n");
            }
            if (value)
                this.insertNode(this.parser.schema.text(value));
            this.findInText(dom);
        }
        else {
            this.findInside(dom);
        }
    }
    // Try to find a handler for the given tag and use that to parse. If
    // none is found, the element's content nodes are added directly.
    addElement(dom, matchAfter) {
        let name = dom.nodeName.toLowerCase(), ruleID;
        if (listTags.hasOwnProperty(name) && this.parser.normalizeLists)
            normalizeList(dom);
        let rule = (this.options.ruleFromNode && this.options.ruleFromNode(dom)) ||
            (ruleID = this.parser.matchTag(dom, this, matchAfter));
        if (rule ? rule.ignore : ignoreTags.hasOwnProperty(name)) {
            this.findInside(dom);
            this.ignoreFallback(dom);
        }
        else if (!rule || rule.skip || rule.closeParent) {
            if (rule && rule.closeParent)
                this.open = Math.max(0, this.open - 1);
            else if (rule && rule.skip.nodeType)
                dom = rule.skip;
            let sync, top = this.top, oldNeedsBlock = this.needsBlock;
            if (blockTags.hasOwnProperty(name)) {
                if (top.content.length && top.content[0].isInline && this.open) {
                    this.open--;
                    top = this.top;
                }
                sync = true;
                if (!top.type)
                    this.needsBlock = true;
            }
            else if (!dom.firstChild) {
                this.leafFallback(dom);
                return;
            }
            if (rule && rule.skip)
                this.addAll(dom);
            else
                this.withStyleRules(dom, () => this.addAll(dom));
            if (sync)
                this.sync(top);
            this.needsBlock = oldNeedsBlock;
        }
        else {
            this.withStyleRules(dom, () => {
                this.addElementByRule(dom, rule, rule.consuming === false ? ruleID : undefined);
            });
        }
    }
    // Called for leaf DOM nodes that would otherwise be ignored
    leafFallback(dom) {
        if (dom.nodeName == "BR" && this.top.type && this.top.type.inlineContent)
            this.addTextNode(dom.ownerDocument.createTextNode("\n"));
    }
    // Called for ignored nodes
    ignoreFallback(dom) {
        // Ignored BR nodes should at least create an inline context
        if (dom.nodeName == "BR" && (!this.top.type || !this.top.type.inlineContent))
            this.findPlace(this.parser.schema.text("-"));
    }
    // Run any style parser associated with the node's styles. Either
    // return an array of marks, or null to indicate some of the styles
    // had a rule with `ignore` set.
    readStyles(styles) {
        let add = Mark.none, remove = Mark.none;
        for (let i = 0; i < styles.length; i += 2) {
            for (let after = undefined;;) {
                let rule = this.parser.matchStyle(styles[i], styles[i + 1], this, after);
                if (!rule)
                    break;
                if (rule.ignore)
                    return null;
                if (rule.clearMark) {
                    this.top.pendingMarks.concat(this.top.activeMarks).forEach(m => {
                        if (rule.clearMark(m))
                            remove = m.addToSet(remove);
                    });
                }
                else {
                    add = this.parser.schema.marks[rule.mark].create(rule.attrs).addToSet(add);
                }
                if (rule.consuming === false)
                    after = rule;
                else
                    break;
            }
        }
        return [add, remove];
    }
    // Look up a handler for the given node. If none are found, return
    // false. Otherwise, apply it, use its return value to drive the way
    // the node's content is wrapped, and return true.
    addElementByRule(dom, rule, continueAfter) {
        let sync, nodeType, mark;
        if (rule.node) {
            nodeType = this.parser.schema.nodes[rule.node];
            if (!nodeType.isLeaf) {
                sync = this.enter(nodeType, rule.attrs || null, rule.preserveWhitespace);
            }
            else if (!this.insertNode(nodeType.create(rule.attrs))) {
                this.leafFallback(dom);
            }
        }
        else {
            let markType = this.parser.schema.marks[rule.mark];
            mark = markType.create(rule.attrs);
            this.addPendingMark(mark);
        }
        let startIn = this.top;
        if (nodeType && nodeType.isLeaf) {
            this.findInside(dom);
        }
        else if (continueAfter) {
            this.addElement(dom, continueAfter);
        }
        else if (rule.getContent) {
            this.findInside(dom);
            rule.getContent(dom, this.parser.schema).forEach(node => this.insertNode(node));
        }
        else {
            let contentDOM = dom;
            if (typeof rule.contentElement == "string")
                contentDOM = dom.querySelector(rule.contentElement);
            else if (typeof rule.contentElement == "function")
                contentDOM = rule.contentElement(dom);
            else if (rule.contentElement)
                contentDOM = rule.contentElement;
            this.findAround(dom, contentDOM, true);
            this.addAll(contentDOM);
        }
        if (sync && this.sync(startIn))
            this.open--;
        if (mark)
            this.removePendingMark(mark, startIn);
    }
    // Add all child nodes between `startIndex` and `endIndex` (or the
    // whole node, if not given). If `sync` is passed, use it to
    // synchronize after every block element.
    addAll(parent, startIndex, endIndex) {
        let index = startIndex || 0;
        for (let dom = startIndex ? parent.childNodes[startIndex] : parent.firstChild, end = endIndex == null ? null : parent.childNodes[endIndex]; dom != end; dom = dom.nextSibling, ++index) {
            this.findAtPoint(parent, index);
            this.addDOM(dom);
        }
        this.findAtPoint(parent, index);
    }
    // Try to find a way to fit the given node type into the current
    // context. May add intermediate wrappers and/or leave non-solid
    // nodes that we're in.
    findPlace(node) {
        let route, sync;
        for (let depth = this.open; depth >= 0; depth--) {
            let cx = this.nodes[depth];
            let found = cx.findWrapping(node);
            if (found && (!route || route.length > found.length)) {
                route = found;
                sync = cx;
                if (!found.length)
                    break;
            }
            if (cx.solid)
                break;
        }
        if (!route)
            return false;
        this.sync(sync);
        for (let i = 0; i < route.length; i++)
            this.enterInner(route[i], null, false);
        return true;
    }
    // Try to insert the given node, adjusting the context when needed.
    insertNode(node) {
        if (node.isInline && this.needsBlock && !this.top.type) {
            let block = this.textblockFromContext();
            if (block)
                this.enterInner(block);
        }
        if (this.findPlace(node)) {
            this.closeExtra();
            let top = this.top;
            top.applyPending(node.type);
            if (top.match)
                top.match = top.match.matchType(node.type);
            let marks = top.activeMarks;
            for (let i = 0; i < node.marks.length; i++)
                if (!top.type || top.type.allowsMarkType(node.marks[i].type))
                    marks = node.marks[i].addToSet(marks);
            top.content.push(node.mark(marks));
            return true;
        }
        return false;
    }
    // Try to start a node of the given type, adjusting the context when
    // necessary.
    enter(type, attrs, preserveWS) {
        let ok = this.findPlace(type.create(attrs));
        if (ok)
            this.enterInner(type, attrs, true, preserveWS);
        return ok;
    }
    // Open a node of the given type
    enterInner(type, attrs = null, solid = false, preserveWS) {
        this.closeExtra();
        let top = this.top;
        top.applyPending(type);
        top.match = top.match && top.match.matchType(type);
        let options = wsOptionsFor(type, preserveWS, top.options);
        if ((top.options & OPT_OPEN_LEFT) && top.content.length == 0)
            options |= OPT_OPEN_LEFT;
        this.nodes.push(new NodeContext(type, attrs, top.activeMarks, top.pendingMarks, solid, null, options));
        this.open++;
    }
    // Make sure all nodes above this.open are finished and added to
    // their parents
    closeExtra(openEnd = false) {
        let i = this.nodes.length - 1;
        if (i > this.open) {
            for (; i > this.open; i--)
                this.nodes[i - 1].content.push(this.nodes[i].finish(openEnd));
            this.nodes.length = this.open + 1;
        }
    }
    finish() {
        this.open = 0;
        this.closeExtra(this.isOpen);
        return this.nodes[0].finish(this.isOpen || this.options.topOpen);
    }
    sync(to) {
        for (let i = this.open; i >= 0; i--)
            if (this.nodes[i] == to) {
                this.open = i;
                return true;
            }
        return false;
    }
    get currentPos() {
        this.closeExtra();
        let pos = 0;
        for (let i = this.open; i >= 0; i--) {
            let content = this.nodes[i].content;
            for (let j = content.length - 1; j >= 0; j--)
                pos += content[j].nodeSize;
            if (i)
                pos++;
        }
        return pos;
    }
    findAtPoint(parent, offset) {
        if (this.find)
            for (let i = 0; i < this.find.length; i++) {
                if (this.find[i].node == parent && this.find[i].offset == offset)
                    this.find[i].pos = this.currentPos;
            }
    }
    findInside(parent) {
        if (this.find)
            for (let i = 0; i < this.find.length; i++) {
                if (this.find[i].pos == null && parent.nodeType == 1 && parent.contains(this.find[i].node))
                    this.find[i].pos = this.currentPos;
            }
    }
    findAround(parent, content, before) {
        if (parent != content && this.find)
            for (let i = 0; i < this.find.length; i++) {
                if (this.find[i].pos == null && parent.nodeType == 1 && parent.contains(this.find[i].node)) {
                    let pos = content.compareDocumentPosition(this.find[i].node);
                    if (pos & (before ? 2 : 4))
                        this.find[i].pos = this.currentPos;
                }
            }
    }
    findInText(textNode) {
        if (this.find)
            for (let i = 0; i < this.find.length; i++) {
                if (this.find[i].node == textNode)
                    this.find[i].pos = this.currentPos - (textNode.nodeValue.length - this.find[i].offset);
            }
    }
    // Determines whether the given context string matches this context.
    matchesContext(context) {
        if (context.indexOf("|") > -1)
            return context.split(/\s*\|\s*/).some(this.matchesContext, this);
        let parts = context.split("/");
        let option = this.options.context;
        let useRoot = !this.isOpen && (!option || option.parent.type == this.nodes[0].type);
        let minDepth = -(option ? option.depth + 1 : 0) + (useRoot ? 0 : 1);
        let match = (i, depth) => {
            for (; i >= 0; i--) {
                let part = parts[i];
                if (part == "") {
                    if (i == parts.length - 1 || i == 0)
                        continue;
                    for (; depth >= minDepth; depth--)
                        if (match(i - 1, depth))
                            return true;
                    return false;
                }
                else {
                    let next = depth > 0 || (depth == 0 && useRoot) ? this.nodes[depth].type
                        : option && depth >= minDepth ? option.node(depth - minDepth).type
                            : null;
                    if (!next || (next.name != part && next.groups.indexOf(part) == -1))
                        return false;
                    depth--;
                }
            }
            return true;
        };
        return match(parts.length - 1, this.open);
    }
    textblockFromContext() {
        let $context = this.options.context;
        if ($context)
            for (let d = $context.depth; d >= 0; d--) {
                let deflt = $context.node(d).contentMatchAt($context.indexAfter(d)).defaultType;
                if (deflt && deflt.isTextblock && deflt.defaultAttrs)
                    return deflt;
            }
        for (let name in this.parser.schema.nodes) {
            let type = this.parser.schema.nodes[name];
            if (type.isTextblock && type.defaultAttrs)
                return type;
        }
    }
    addPendingMark(mark) {
        let found = findSameMarkInSet(mark, this.top.pendingMarks);
        if (found)
            this.top.stashMarks.push(found);
        this.top.pendingMarks = mark.addToSet(this.top.pendingMarks);
    }
    removePendingMark(mark, upto) {
        for (let depth = this.open; depth >= 0; depth--) {
            let level = this.nodes[depth];
            let found = level.pendingMarks.lastIndexOf(mark);
            if (found > -1) {
                level.pendingMarks = mark.removeFromSet(level.pendingMarks);
            }
            else {
                level.activeMarks = mark.removeFromSet(level.activeMarks);
                let stashMark = level.popFromStashMark(mark);
                if (stashMark && level.type && level.type.allowsMarkType(stashMark.type))
                    level.activeMarks = stashMark.addToSet(level.activeMarks);
            }
            if (level == upto)
                break;
        }
    }
}
// Kludge to work around directly nested list nodes produced by some
// tools and allowed by browsers to mean that the nested list is
// actually part of the list item above it.
function normalizeList(dom) {
    for (let child = dom.firstChild, prevItem = null; child; child = child.nextSibling) {
        let name = child.nodeType == 1 ? child.nodeName.toLowerCase() : null;
        if (name && listTags.hasOwnProperty(name) && prevItem) {
            prevItem.appendChild(child);
            child = prevItem;
        }
        else if (name == "li") {
            prevItem = child;
        }
        else if (name) {
            prevItem = null;
        }
    }
}
// Apply a CSS selector.
function matches(dom, selector) {
    return (dom.matches || dom.msMatchesSelector || dom.webkitMatchesSelector || dom.mozMatchesSelector).call(dom, selector);
}
// Tokenize a style attribute into property/value pairs.
function parseStyles(style) {
    let re = /\s*([\w-]+)\s*:\s*([^;]+)/g, m, result = [];
    while (m = re.exec(style))
        result.push(m[1], m[2].trim());
    return result;
}
function copy(obj) {
    let copy = {};
    for (let prop in obj)
        copy[prop] = obj[prop];
    return copy;
}
// Used when finding a mark at the top level of a fragment parse.
// Checks whether it would be reasonable to apply a given mark type to
// a given node, by looking at the way the mark occurs in the schema.
function markMayApply(markType, nodeType) {
    let nodes = nodeType.schema.nodes;
    for (let name in nodes) {
        let parent = nodes[name];
        if (!parent.allowsMarkType(markType))
            continue;
        let seen = [], scan = (match) => {
            seen.push(match);
            for (let i = 0; i < match.edgeCount; i++) {
                let { type, next } = match.edge(i);
                if (type == nodeType)
                    return true;
                if (seen.indexOf(next) < 0 && scan(next))
                    return true;
            }
        };
        if (scan(parent.contentMatch))
            return true;
    }
}
function findSameMarkInSet(mark, set) {
    for (let i = 0; i < set.length; i++) {
        if (mark.eq(set[i]))
            return set[i];
    }
}

/**
A DOM serializer knows how to convert ProseMirror nodes and
marks of various types to DOM nodes.
*/
class DOMSerializer {
    /**
    Create a serializer. `nodes` should map node names to functions
    that take a node and return a description of the corresponding
    DOM. `marks` does the same for mark names, but also gets an
    argument that tells it whether the mark's content is block or
    inline content (for typical use, it'll always be inline). A mark
    serializer may be `null` to indicate that marks of that type
    should not be serialized.
    */
    constructor(
    /**
    The node serialization functions.
    */
    nodes, 
    /**
    The mark serialization functions.
    */
    marks) {
        this.nodes = nodes;
        this.marks = marks;
    }
    /**
    Serialize the content of this fragment to a DOM fragment. When
    not in the browser, the `document` option, containing a DOM
    document, should be passed so that the serializer can create
    nodes.
    */
    serializeFragment(fragment, options = {}, target) {
        if (!target)
            target = doc(options).createDocumentFragment();
        let top = target, active = [];
        fragment.forEach(node => {
            if (active.length || node.marks.length) {
                let keep = 0, rendered = 0;
                while (keep < active.length && rendered < node.marks.length) {
                    let next = node.marks[rendered];
                    if (!this.marks[next.type.name]) {
                        rendered++;
                        continue;
                    }
                    if (!next.eq(active[keep][0]) || next.type.spec.spanning === false)
                        break;
                    keep++;
                    rendered++;
                }
                while (keep < active.length)
                    top = active.pop()[1];
                while (rendered < node.marks.length) {
                    let add = node.marks[rendered++];
                    let markDOM = this.serializeMark(add, node.isInline, options);
                    if (markDOM) {
                        active.push([add, top]);
                        top.appendChild(markDOM.dom);
                        top = markDOM.contentDOM || markDOM.dom;
                    }
                }
            }
            top.appendChild(this.serializeNodeInner(node, options));
        });
        return target;
    }
    /**
    @internal
    */
    serializeNodeInner(node, options) {
        let { dom, contentDOM } = DOMSerializer.renderSpec(doc(options), this.nodes[node.type.name](node));
        if (contentDOM) {
            if (node.isLeaf)
                throw new RangeError("Content hole not allowed in a leaf node spec");
            this.serializeFragment(node.content, options, contentDOM);
        }
        return dom;
    }
    /**
    Serialize this node to a DOM node. This can be useful when you
    need to serialize a part of a document, as opposed to the whole
    document. To serialize a whole document, use
    [`serializeFragment`](https://prosemirror.net/docs/ref/#model.DOMSerializer.serializeFragment) on
    its [content](https://prosemirror.net/docs/ref/#model.Node.content).
    */
    serializeNode(node, options = {}) {
        let dom = this.serializeNodeInner(node, options);
        for (let i = node.marks.length - 1; i >= 0; i--) {
            let wrap = this.serializeMark(node.marks[i], node.isInline, options);
            if (wrap) {
                (wrap.contentDOM || wrap.dom).appendChild(dom);
                dom = wrap.dom;
            }
        }
        return dom;
    }
    /**
    @internal
    */
    serializeMark(mark, inline, options = {}) {
        let toDOM = this.marks[mark.type.name];
        return toDOM && DOMSerializer.renderSpec(doc(options), toDOM(mark, inline));
    }
    /**
    Render an [output spec](https://prosemirror.net/docs/ref/#model.DOMOutputSpec) to a DOM node. If
    the spec has a hole (zero) in it, `contentDOM` will point at the
    node with the hole.
    */
    static renderSpec(doc, structure, xmlNS = null) {
        if (typeof structure == "string")
            return { dom: doc.createTextNode(structure) };
        if (structure.nodeType != null)
            return { dom: structure };
        if (structure.dom && structure.dom.nodeType != null)
            return structure;
        let tagName = structure[0], space = tagName.indexOf(" ");
        if (space > 0) {
            xmlNS = tagName.slice(0, space);
            tagName = tagName.slice(space + 1);
        }
        let contentDOM;
        let dom = (xmlNS ? doc.createElementNS(xmlNS, tagName) : doc.createElement(tagName));
        let attrs = structure[1], start = 1;
        if (attrs && typeof attrs == "object" && attrs.nodeType == null && !Array.isArray(attrs)) {
            start = 2;
            for (let name in attrs)
                if (attrs[name] != null) {
                    let space = name.indexOf(" ");
                    if (space > 0)
                        dom.setAttributeNS(name.slice(0, space), name.slice(space + 1), attrs[name]);
                    else
                        dom.setAttribute(name, attrs[name]);
                }
        }
        for (let i = start; i < structure.length; i++) {
            let child = structure[i];
            if (child === 0) {
                if (i < structure.length - 1 || i > start)
                    throw new RangeError("Content hole must be the only child of its parent node");
                return { dom, contentDOM: dom };
            }
            else {
                let { dom: inner, contentDOM: innerContent } = DOMSerializer.renderSpec(doc, child, xmlNS);
                dom.appendChild(inner);
                if (innerContent) {
                    if (contentDOM)
                        throw new RangeError("Multiple content holes");
                    contentDOM = innerContent;
                }
            }
        }
        return { dom, contentDOM };
    }
    /**
    Build a serializer using the [`toDOM`](https://prosemirror.net/docs/ref/#model.NodeSpec.toDOM)
    properties in a schema's node and mark specs.
    */
    static fromSchema(schema) {
        return schema.cached.domSerializer ||
            (schema.cached.domSerializer = new DOMSerializer(this.nodesFromSchema(schema), this.marksFromSchema(schema)));
    }
    /**
    Gather the serializers in a schema's node specs into an object.
    This can be useful as a base to build a custom serializer from.
    */
    static nodesFromSchema(schema) {
        let result = gatherToDOM(schema.nodes);
        if (!result.text)
            result.text = node => node.text;
        return result;
    }
    /**
    Gather the serializers in a schema's mark specs into an object.
    */
    static marksFromSchema(schema) {
        return gatherToDOM(schema.marks);
    }
}
function gatherToDOM(obj) {
    let result = {};
    for (let name in obj) {
        let toDOM = obj[name].spec.toDOM;
        if (toDOM)
            result[name] = toDOM;
    }
    return result;
}
function doc(options) {
    return options.document || window.document;
}

export { ContentMatch, DOMParser, DOMSerializer, Fragment, Mark, MarkType, Node, NodeRange, NodeType, ReplaceError, ResolvedPos, Schema, Slice };

    global.model = module.exports || exports;
  })();

  // === ProseMirror: transform (prosemirror-transform.js) ===
  (function() {
    var exports = {};
    var module = { exports: exports };
    import { ReplaceError, Slice, Fragment, MarkType, Mark } from 'prosemirror-model';

// Recovery values encode a range index and an offset. They are
// represented as numbers, because tons of them will be created when
// mapping, for example, a large number of decorations. The number's
// lower 16 bits provide the index, the remaining bits the offset.
//
// Note: We intentionally don't use bit shift operators to en- and
// decode these, since those clip to 32 bits, which we might in rare
// cases want to overflow. A 64-bit float can represent 48-bit
// integers precisely.
const lower16 = 0xffff;
const factor16 = Math.pow(2, 16);
function makeRecover(index, offset) { return index + offset * factor16; }
function recoverIndex(value) { return value & lower16; }
function recoverOffset(value) { return (value - (value & lower16)) / factor16; }
const DEL_BEFORE = 1, DEL_AFTER = 2, DEL_ACROSS = 4, DEL_SIDE = 8;
/**
An object representing a mapped position with extra
information.
*/
class MapResult {
    /**
    @internal
    */
    constructor(
    /**
    The mapped version of the position.
    */
    pos, 
    /**
    @internal
    */
    delInfo, 
    /**
    @internal
    */
    recover) {
        this.pos = pos;
        this.delInfo = delInfo;
        this.recover = recover;
    }
    /**
    Tells you whether the position was deleted, that is, whether the
    step removed the token on the side queried (via the `assoc`)
    argument from the document.
    */
    get deleted() { return (this.delInfo & DEL_SIDE) > 0; }
    /**
    Tells you whether the token before the mapped position was deleted.
    */
    get deletedBefore() { return (this.delInfo & (DEL_BEFORE | DEL_ACROSS)) > 0; }
    /**
    True when the token after the mapped position was deleted.
    */
    get deletedAfter() { return (this.delInfo & (DEL_AFTER | DEL_ACROSS)) > 0; }
    /**
    Tells whether any of the steps mapped through deletes across the
    position (including both the token before and after the
    position).
    */
    get deletedAcross() { return (this.delInfo & DEL_ACROSS) > 0; }
}
/**
A map describing the deletions and insertions made by a step, which
can be used to find the correspondence between positions in the
pre-step version of a document and the same position in the
post-step version.
*/
class StepMap {
    /**
    Create a position map. The modifications to the document are
    represented as an array of numbers, in which each group of three
    represents a modified chunk as `[start, oldSize, newSize]`.
    */
    constructor(
    /**
    @internal
    */
    ranges, 
    /**
    @internal
    */
    inverted = false) {
        this.ranges = ranges;
        this.inverted = inverted;
        if (!ranges.length && StepMap.empty)
            return StepMap.empty;
    }
    /**
    @internal
    */
    recover(value) {
        let diff = 0, index = recoverIndex(value);
        if (!this.inverted)
            for (let i = 0; i < index; i++)
                diff += this.ranges[i * 3 + 2] - this.ranges[i * 3 + 1];
        return this.ranges[index * 3] + diff + recoverOffset(value);
    }
    mapResult(pos, assoc = 1) { return this._map(pos, assoc, false); }
    map(pos, assoc = 1) { return this._map(pos, assoc, true); }
    /**
    @internal
    */
    _map(pos, assoc, simple) {
        let diff = 0, oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2;
        for (let i = 0; i < this.ranges.length; i += 3) {
            let start = this.ranges[i] - (this.inverted ? diff : 0);
            if (start > pos)
                break;
            let oldSize = this.ranges[i + oldIndex], newSize = this.ranges[i + newIndex], end = start + oldSize;
            if (pos <= end) {
                let side = !oldSize ? assoc : pos == start ? -1 : pos == end ? 1 : assoc;
                let result = start + diff + (side < 0 ? 0 : newSize);
                if (simple)
                    return result;
                let recover = pos == (assoc < 0 ? start : end) ? null : makeRecover(i / 3, pos - start);
                let del = pos == start ? DEL_AFTER : pos == end ? DEL_BEFORE : DEL_ACROSS;
                if (assoc < 0 ? pos != start : pos != end)
                    del |= DEL_SIDE;
                return new MapResult(result, del, recover);
            }
            diff += newSize - oldSize;
        }
        return simple ? pos + diff : new MapResult(pos + diff, 0, null);
    }
    /**
    @internal
    */
    touches(pos, recover) {
        let diff = 0, index = recoverIndex(recover);
        let oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2;
        for (let i = 0; i < this.ranges.length; i += 3) {
            let start = this.ranges[i] - (this.inverted ? diff : 0);
            if (start > pos)
                break;
            let oldSize = this.ranges[i + oldIndex], end = start + oldSize;
            if (pos <= end && i == index * 3)
                return true;
            diff += this.ranges[i + newIndex] - oldSize;
        }
        return false;
    }
    /**
    Calls the given function on each of the changed ranges included in
    this map.
    */
    forEach(f) {
        let oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2;
        for (let i = 0, diff = 0; i < this.ranges.length; i += 3) {
            let start = this.ranges[i], oldStart = start - (this.inverted ? diff : 0), newStart = start + (this.inverted ? 0 : diff);
            let oldSize = this.ranges[i + oldIndex], newSize = this.ranges[i + newIndex];
            f(oldStart, oldStart + oldSize, newStart, newStart + newSize);
            diff += newSize - oldSize;
        }
    }
    /**
    Create an inverted version of this map. The result can be used to
    map positions in the post-step document to the pre-step document.
    */
    invert() {
        return new StepMap(this.ranges, !this.inverted);
    }
    /**
    @internal
    */
    toString() {
        return (this.inverted ? "-" : "") + JSON.stringify(this.ranges);
    }
    /**
    Create a map that moves all positions by offset `n` (which may be
    negative). This can be useful when applying steps meant for a
    sub-document to a larger document, or vice-versa.
    */
    static offset(n) {
        return n == 0 ? StepMap.empty : new StepMap(n < 0 ? [0, -n, 0] : [0, 0, n]);
    }
}
/**
A StepMap that contains no changed ranges.
*/
StepMap.empty = new StepMap([]);
/**
A mapping represents a pipeline of zero or more [step
maps](https://prosemirror.net/docs/ref/#transform.StepMap). It has special provisions for losslessly
handling mapping positions through a series of steps in which some
steps are inverted versions of earlier steps. (This comes up when
‘[rebasing](/docs/guide/#transform.rebasing)’ steps for
collaboration or history management.)
*/
class Mapping {
    /**
    Create a new mapping with the given position maps.
    */
    constructor(
    /**
    The step maps in this mapping.
    */
    maps = [], 
    /**
    @internal
    */
    mirror, 
    /**
    The starting position in the `maps` array, used when `map` or
    `mapResult` is called.
    */
    from = 0, 
    /**
    The end position in the `maps` array.
    */
    to = maps.length) {
        this.maps = maps;
        this.mirror = mirror;
        this.from = from;
        this.to = to;
    }
    /**
    Create a mapping that maps only through a part of this one.
    */
    slice(from = 0, to = this.maps.length) {
        return new Mapping(this.maps, this.mirror, from, to);
    }
    /**
    @internal
    */
    copy() {
        return new Mapping(this.maps.slice(), this.mirror && this.mirror.slice(), this.from, this.to);
    }
    /**
    Add a step map to the end of this mapping. If `mirrors` is
    given, it should be the index of the step map that is the mirror
    image of this one.
    */
    appendMap(map, mirrors) {
        this.to = this.maps.push(map);
        if (mirrors != null)
            this.setMirror(this.maps.length - 1, mirrors);
    }
    /**
    Add all the step maps in a given mapping to this one (preserving
    mirroring information).
    */
    appendMapping(mapping) {
        for (let i = 0, startSize = this.maps.length; i < mapping.maps.length; i++) {
            let mirr = mapping.getMirror(i);
            this.appendMap(mapping.maps[i], mirr != null && mirr < i ? startSize + mirr : undefined);
        }
    }
    /**
    Finds the offset of the step map that mirrors the map at the
    given offset, in this mapping (as per the second argument to
    `appendMap`).
    */
    getMirror(n) {
        if (this.mirror)
            for (let i = 0; i < this.mirror.length; i++)
                if (this.mirror[i] == n)
                    return this.mirror[i + (i % 2 ? -1 : 1)];
    }
    /**
    @internal
    */
    setMirror(n, m) {
        if (!this.mirror)
            this.mirror = [];
        this.mirror.push(n, m);
    }
    /**
    Append the inverse of the given mapping to this one.
    */
    appendMappingInverted(mapping) {
        for (let i = mapping.maps.length - 1, totalSize = this.maps.length + mapping.maps.length; i >= 0; i--) {
            let mirr = mapping.getMirror(i);
            this.appendMap(mapping.maps[i].invert(), mirr != null && mirr > i ? totalSize - mirr - 1 : undefined);
        }
    }
    /**
    Create an inverted version of this mapping.
    */
    invert() {
        let inverse = new Mapping;
        inverse.appendMappingInverted(this);
        return inverse;
    }
    /**
    Map a position through this mapping.
    */
    map(pos, assoc = 1) {
        if (this.mirror)
            return this._map(pos, assoc, true);
        for (let i = this.from; i < this.to; i++)
            pos = this.maps[i].map(pos, assoc);
        return pos;
    }
    /**
    Map a position through this mapping, returning a mapping
    result.
    */
    mapResult(pos, assoc = 1) { return this._map(pos, assoc, false); }
    /**
    @internal
    */
    _map(pos, assoc, simple) {
        let delInfo = 0;
        for (let i = this.from; i < this.to; i++) {
            let map = this.maps[i], result = map.mapResult(pos, assoc);
            if (result.recover != null) {
                let corr = this.getMirror(i);
                if (corr != null && corr > i && corr < this.to) {
                    i = corr;
                    pos = this.maps[corr].recover(result.recover);
                    continue;
                }
            }
            delInfo |= result.delInfo;
            pos = result.pos;
        }
        return simple ? pos : new MapResult(pos, delInfo, null);
    }
}

const stepsByID = Object.create(null);
/**
A step object represents an atomic change. It generally applies
only to the document it was created for, since the positions
stored in it will only make sense for that document.

New steps are defined by creating classes that extend `Step`,
overriding the `apply`, `invert`, `map`, `getMap` and `fromJSON`
methods, and registering your class with a unique
JSON-serialization identifier using
[`Step.jsonID`](https://prosemirror.net/docs/ref/#transform.Step^jsonID).
*/
class Step {
    /**
    Get the step map that represents the changes made by this step,
    and which can be used to transform between positions in the old
    and the new document.
    */
    getMap() { return StepMap.empty; }
    /**
    Try to merge this step with another one, to be applied directly
    after it. Returns the merged step when possible, null if the
    steps can't be merged.
    */
    merge(other) { return null; }
    /**
    Deserialize a step from its JSON representation. Will call
    through to the step class' own implementation of this method.
    */
    static fromJSON(schema, json) {
        if (!json || !json.stepType)
            throw new RangeError("Invalid input for Step.fromJSON");
        let type = stepsByID[json.stepType];
        if (!type)
            throw new RangeError(`No step type ${json.stepType} defined`);
        return type.fromJSON(schema, json);
    }
    /**
    To be able to serialize steps to JSON, each step needs a string
    ID to attach to its JSON representation. Use this method to
    register an ID for your step classes. Try to pick something
    that's unlikely to clash with steps from other modules.
    */
    static jsonID(id, stepClass) {
        if (id in stepsByID)
            throw new RangeError("Duplicate use of step JSON ID " + id);
        stepsByID[id] = stepClass;
        stepClass.prototype.jsonID = id;
        return stepClass;
    }
}
/**
The result of [applying](https://prosemirror.net/docs/ref/#transform.Step.apply) a step. Contains either a
new document or a failure value.
*/
class StepResult {
    /**
    @internal
    */
    constructor(
    /**
    The transformed document, if successful.
    */
    doc, 
    /**
    The failure message, if unsuccessful.
    */
    failed) {
        this.doc = doc;
        this.failed = failed;
    }
    /**
    Create a successful step result.
    */
    static ok(doc) { return new StepResult(doc, null); }
    /**
    Create a failed step result.
    */
    static fail(message) { return new StepResult(null, message); }
    /**
    Call [`Node.replace`](https://prosemirror.net/docs/ref/#model.Node.replace) with the given
    arguments. Create a successful result if it succeeds, and a
    failed one if it throws a `ReplaceError`.
    */
    static fromReplace(doc, from, to, slice) {
        try {
            return StepResult.ok(doc.replace(from, to, slice));
        }
        catch (e) {
            if (e instanceof ReplaceError)
                return StepResult.fail(e.message);
            throw e;
        }
    }
}

function mapFragment(fragment, f, parent) {
    let mapped = [];
    for (let i = 0; i < fragment.childCount; i++) {
        let child = fragment.child(i);
        if (child.content.size)
            child = child.copy(mapFragment(child.content, f, child));
        if (child.isInline)
            child = f(child, parent, i);
        mapped.push(child);
    }
    return Fragment.fromArray(mapped);
}
/**
Add a mark to all inline content between two positions.
*/
class AddMarkStep extends Step {
    /**
    Create a mark step.
    */
    constructor(
    /**
    The start of the marked range.
    */
    from, 
    /**
    The end of the marked range.
    */
    to, 
    /**
    The mark to add.
    */
    mark) {
        super();
        this.from = from;
        this.to = to;
        this.mark = mark;
    }
    apply(doc) {
        let oldSlice = doc.slice(this.from, this.to), $from = doc.resolve(this.from);
        let parent = $from.node($from.sharedDepth(this.to));
        let slice = new Slice(mapFragment(oldSlice.content, (node, parent) => {
            if (!node.isAtom || !parent.type.allowsMarkType(this.mark.type))
                return node;
            return node.mark(this.mark.addToSet(node.marks));
        }, parent), oldSlice.openStart, oldSlice.openEnd);
        return StepResult.fromReplace(doc, this.from, this.to, slice);
    }
    invert() {
        return new RemoveMarkStep(this.from, this.to, this.mark);
    }
    map(mapping) {
        let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1);
        if (from.deleted && to.deleted || from.pos >= to.pos)
            return null;
        return new AddMarkStep(from.pos, to.pos, this.mark);
    }
    merge(other) {
        if (other instanceof AddMarkStep &&
            other.mark.eq(this.mark) &&
            this.from <= other.to && this.to >= other.from)
            return new AddMarkStep(Math.min(this.from, other.from), Math.max(this.to, other.to), this.mark);
        return null;
    }
    toJSON() {
        return { stepType: "addMark", mark: this.mark.toJSON(),
            from: this.from, to: this.to };
    }
    /**
    @internal
    */
    static fromJSON(schema, json) {
        if (typeof json.from != "number" || typeof json.to != "number")
            throw new RangeError("Invalid input for AddMarkStep.fromJSON");
        return new AddMarkStep(json.from, json.to, schema.markFromJSON(json.mark));
    }
}
Step.jsonID("addMark", AddMarkStep);
/**
Remove a mark from all inline content between two positions.
*/
class RemoveMarkStep extends Step {
    /**
    Create a mark-removing step.
    */
    constructor(
    /**
    The start of the unmarked range.
    */
    from, 
    /**
    The end of the unmarked range.
    */
    to, 
    /**
    The mark to remove.
    */
    mark) {
        super();
        this.from = from;
        this.to = to;
        this.mark = mark;
    }
    apply(doc) {
        let oldSlice = doc.slice(this.from, this.to);
        let slice = new Slice(mapFragment(oldSlice.content, node => {
            return node.mark(this.mark.removeFromSet(node.marks));
        }, doc), oldSlice.openStart, oldSlice.openEnd);
        return StepResult.fromReplace(doc, this.from, this.to, slice);
    }
    invert() {
        return new AddMarkStep(this.from, this.to, this.mark);
    }
    map(mapping) {
        let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1);
        if (from.deleted && to.deleted || from.pos >= to.pos)
            return null;
        return new RemoveMarkStep(from.pos, to.pos, this.mark);
    }
    merge(other) {
        if (other instanceof RemoveMarkStep &&
            other.mark.eq(this.mark) &&
            this.from <= other.to && this.to >= other.from)
            return new RemoveMarkStep(Math.min(this.from, other.from), Math.max(this.to, other.to), this.mark);
        return null;
    }
    toJSON() {
        return { stepType: "removeMark", mark: this.mark.toJSON(),
            from: this.from, to: this.to };
    }
    /**
    @internal
    */
    static fromJSON(schema, json) {
        if (typeof json.from != "number" || typeof json.to != "number")
            throw new RangeError("Invalid input for RemoveMarkStep.fromJSON");
        return new RemoveMarkStep(json.from, json.to, schema.markFromJSON(json.mark));
    }
}
Step.jsonID("removeMark", RemoveMarkStep);
/**
Add a mark to a specific node.
*/
class AddNodeMarkStep extends Step {
    /**
    Create a node mark step.
    */
    constructor(
    /**
    The position of the target node.
    */
    pos, 
    /**
    The mark to add.
    */
    mark) {
        super();
        this.pos = pos;
        this.mark = mark;
    }
    apply(doc) {
        let node = doc.nodeAt(this.pos);
        if (!node)
            return StepResult.fail("No node at mark step's position");
        let updated = node.type.create(node.attrs, null, this.mark.addToSet(node.marks));
        return StepResult.fromReplace(doc, this.pos, this.pos + 1, new Slice(Fragment.from(updated), 0, node.isLeaf ? 0 : 1));
    }
    invert(doc) {
        let node = doc.nodeAt(this.pos);
        if (node) {
            let newSet = this.mark.addToSet(node.marks);
            if (newSet.length == node.marks.length) {
                for (let i = 0; i < node.marks.length; i++)
                    if (!node.marks[i].isInSet(newSet))
                        return new AddNodeMarkStep(this.pos, node.marks[i]);
                return new AddNodeMarkStep(this.pos, this.mark);
            }
        }
        return new RemoveNodeMarkStep(this.pos, this.mark);
    }
    map(mapping) {
        let pos = mapping.mapResult(this.pos, 1);
        return pos.deletedAfter ? null : new AddNodeMarkStep(pos.pos, this.mark);
    }
    toJSON() {
        return { stepType: "addNodeMark", pos: this.pos, mark: this.mark.toJSON() };
    }
    /**
    @internal
    */
    static fromJSON(schema, json) {
        if (typeof json.pos != "number")
            throw new RangeError("Invalid input for AddNodeMarkStep.fromJSON");
        return new AddNodeMarkStep(json.pos, schema.markFromJSON(json.mark));
    }
}
Step.jsonID("addNodeMark", AddNodeMarkStep);
/**
Remove a mark from a specific node.
*/
class RemoveNodeMarkStep extends Step {
    /**
    Create a mark-removing step.
    */
    constructor(
    /**
    The position of the target node.
    */
    pos, 
    /**
    The mark to remove.
    */
    mark) {
        super();
        this.pos = pos;
        this.mark = mark;
    }
    apply(doc) {
        let node = doc.nodeAt(this.pos);
        if (!node)
            return StepResult.fail("No node at mark step's position");
        let updated = node.type.create(node.attrs, null, this.mark.removeFromSet(node.marks));
        return StepResult.fromReplace(doc, this.pos, this.pos + 1, new Slice(Fragment.from(updated), 0, node.isLeaf ? 0 : 1));
    }
    invert(doc) {
        let node = doc.nodeAt(this.pos);
        if (!node || !this.mark.isInSet(node.marks))
            return this;
        return new AddNodeMarkStep(this.pos, this.mark);
    }
    map(mapping) {
        let pos = mapping.mapResult(this.pos, 1);
        return pos.deletedAfter ? null : new RemoveNodeMarkStep(pos.pos, this.mark);
    }
    toJSON() {
        return { stepType: "removeNodeMark", pos: this.pos, mark: this.mark.toJSON() };
    }
    /**
    @internal
    */
    static fromJSON(schema, json) {
        if (typeof json.pos != "number")
            throw new RangeError("Invalid input for RemoveNodeMarkStep.fromJSON");
        return new RemoveNodeMarkStep(json.pos, schema.markFromJSON(json.mark));
    }
}
Step.jsonID("removeNodeMark", RemoveNodeMarkStep);

/**
Replace a part of the document with a slice of new content.
*/
class ReplaceStep extends Step {
    /**
    The given `slice` should fit the 'gap' between `from` and
    `to`—the depths must line up, and the surrounding nodes must be
    able to be joined with the open sides of the slice. When
    `structure` is true, the step will fail if the content between
    from and to is not just a sequence of closing and then opening
    tokens (this is to guard against rebased replace steps
    overwriting something they weren't supposed to).
    */
    constructor(
    /**
    The start position of the replaced range.
    */
    from, 
    /**
    The end position of the replaced range.
    */
    to, 
    /**
    The slice to insert.
    */
    slice, 
    /**
    @internal
    */
    structure = false) {
        super();
        this.from = from;
        this.to = to;
        this.slice = slice;
        this.structure = structure;
    }
    apply(doc) {
        if (this.structure && contentBetween(doc, this.from, this.to))
            return StepResult.fail("Structure replace would overwrite content");
        return StepResult.fromReplace(doc, this.from, this.to, this.slice);
    }
    getMap() {
        return new StepMap([this.from, this.to - this.from, this.slice.size]);
    }
    invert(doc) {
        return new ReplaceStep(this.from, this.from + this.slice.size, doc.slice(this.from, this.to));
    }
    map(mapping) {
        let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1);
        if (from.deletedAcross && to.deletedAcross)
            return null;
        return new ReplaceStep(from.pos, Math.max(from.pos, to.pos), this.slice);
    }
    merge(other) {
        if (!(other instanceof ReplaceStep) || other.structure || this.structure)
            return null;
        if (this.from + this.slice.size == other.from && !this.slice.openEnd && !other.slice.openStart) {
            let slice = this.slice.size + other.slice.size == 0 ? Slice.empty
                : new Slice(this.slice.content.append(other.slice.content), this.slice.openStart, other.slice.openEnd);
            return new ReplaceStep(this.from, this.to + (other.to - other.from), slice, this.structure);
        }
        else if (other.to == this.from && !this.slice.openStart && !other.slice.openEnd) {
            let slice = this.slice.size + other.slice.size == 0 ? Slice.empty
                : new Slice(other.slice.content.append(this.slice.content), other.slice.openStart, this.slice.openEnd);
            return new ReplaceStep(other.from, this.to, slice, this.structure);
        }
        else {
            return null;
        }
    }
    toJSON() {
        let json = { stepType: "replace", from: this.from, to: this.to };
        if (this.slice.size)
            json.slice = this.slice.toJSON();
        if (this.structure)
            json.structure = true;
        return json;
    }
    /**
    @internal
    */
    static fromJSON(schema, json) {
        if (typeof json.from != "number" || typeof json.to != "number")
            throw new RangeError("Invalid input for ReplaceStep.fromJSON");
        return new ReplaceStep(json.from, json.to, Slice.fromJSON(schema, json.slice), !!json.structure);
    }
}
Step.jsonID("replace", ReplaceStep);
/**
Replace a part of the document with a slice of content, but
preserve a range of the replaced content by moving it into the
slice.
*/
class ReplaceAroundStep extends Step {
    /**
    Create a replace-around step with the given range and gap.
    `insert` should be the point in the slice into which the content
    of the gap should be moved. `structure` has the same meaning as
    it has in the [`ReplaceStep`](https://prosemirror.net/docs/ref/#transform.ReplaceStep) class.
    */
    constructor(
    /**
    The start position of the replaced range.
    */
    from, 
    /**
    The end position of the replaced range.
    */
    to, 
    /**
    The start of preserved range.
    */
    gapFrom, 
    /**
    The end of preserved range.
    */
    gapTo, 
    /**
    The slice to insert.
    */
    slice, 
    /**
    The position in the slice where the preserved range should be
    inserted.
    */
    insert, 
    /**
    @internal
    */
    structure = false) {
        super();
        this.from = from;
        this.to = to;
        this.gapFrom = gapFrom;
        this.gapTo = gapTo;
        this.slice = slice;
        this.insert = insert;
        this.structure = structure;
    }
    apply(doc) {
        if (this.structure && (contentBetween(doc, this.from, this.gapFrom) ||
            contentBetween(doc, this.gapTo, this.to)))
            return StepResult.fail("Structure gap-replace would overwrite content");
        let gap = doc.slice(this.gapFrom, this.gapTo);
        if (gap.openStart || gap.openEnd)
            return StepResult.fail("Gap is not a flat range");
        let inserted = this.slice.insertAt(this.insert, gap.content);
        if (!inserted)
            return StepResult.fail("Content does not fit in gap");
        return StepResult.fromReplace(doc, this.from, this.to, inserted);
    }
    getMap() {
        return new StepMap([this.from, this.gapFrom - this.from, this.insert,
            this.gapTo, this.to - this.gapTo, this.slice.size - this.insert]);
    }
    invert(doc) {
        let gap = this.gapTo - this.gapFrom;
        return new ReplaceAroundStep(this.from, this.from + this.slice.size + gap, this.from + this.insert, this.from + this.insert + gap, doc.slice(this.from, this.to).removeBetween(this.gapFrom - this.from, this.gapTo - this.from), this.gapFrom - this.from, this.structure);
    }
    map(mapping) {
        let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1);
        let gapFrom = this.from == this.gapFrom ? from.pos : mapping.map(this.gapFrom, -1);
        let gapTo = this.to == this.gapTo ? to.pos : mapping.map(this.gapTo, 1);
        if ((from.deletedAcross && to.deletedAcross) || gapFrom < from.pos || gapTo > to.pos)
            return null;
        return new ReplaceAroundStep(from.pos, to.pos, gapFrom, gapTo, this.slice, this.insert, this.structure);
    }
    toJSON() {
        let json = { stepType: "replaceAround", from: this.from, to: this.to,
            gapFrom: this.gapFrom, gapTo: this.gapTo, insert: this.insert };
        if (this.slice.size)
            json.slice = this.slice.toJSON();
        if (this.structure)
            json.structure = true;
        return json;
    }
    /**
    @internal
    */
    static fromJSON(schema, json) {
        if (typeof json.from != "number" || typeof json.to != "number" ||
            typeof json.gapFrom != "number" || typeof json.gapTo != "number" || typeof json.insert != "number")
            throw new RangeError("Invalid input for ReplaceAroundStep.fromJSON");
        return new ReplaceAroundStep(json.from, json.to, json.gapFrom, json.gapTo, Slice.fromJSON(schema, json.slice), json.insert, !!json.structure);
    }
}
Step.jsonID("replaceAround", ReplaceAroundStep);
function contentBetween(doc, from, to) {
    let $from = doc.resolve(from), dist = to - from, depth = $from.depth;
    while (dist > 0 && depth > 0 && $from.indexAfter(depth) == $from.node(depth).childCount) {
        depth--;
        dist--;
    }
    if (dist > 0) {
        let next = $from.node(depth).maybeChild($from.indexAfter(depth));
        while (dist > 0) {
            if (!next || next.isLeaf)
                return true;
            next = next.firstChild;
            dist--;
        }
    }
    return false;
}

function addMark(tr, from, to, mark) {
    let removed = [], added = [];
    let removing, adding;
    tr.doc.nodesBetween(from, to, (node, pos, parent) => {
        if (!node.isInline)
            return;
        let marks = node.marks;
        if (!mark.isInSet(marks) && parent.type.allowsMarkType(mark.type)) {
            let start = Math.max(pos, from), end = Math.min(pos + node.nodeSize, to);
            let newSet = mark.addToSet(marks);
            for (let i = 0; i < marks.length; i++) {
                if (!marks[i].isInSet(newSet)) {
                    if (removing && removing.to == start && removing.mark.eq(marks[i]))
                        removing.to = end;
                    else
                        removed.push(removing = new RemoveMarkStep(start, end, marks[i]));
                }
            }
            if (adding && adding.to == start)
                adding.to = end;
            else
                added.push(adding = new AddMarkStep(start, end, mark));
        }
    });
    removed.forEach(s => tr.step(s));
    added.forEach(s => tr.step(s));
}
function removeMark(tr, from, to, mark) {
    let matched = [], step = 0;
    tr.doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isInline)
            return;
        step++;
        let toRemove = null;
        if (mark instanceof MarkType) {
            let set = node.marks, found;
            while (found = mark.isInSet(set)) {
                (toRemove || (toRemove = [])).push(found);
                set = found.removeFromSet(set);
            }
        }
        else if (mark) {
            if (mark.isInSet(node.marks))
                toRemove = [mark];
        }
        else {
            toRemove = node.marks;
        }
        if (toRemove && toRemove.length) {
            let end = Math.min(pos + node.nodeSize, to);
            for (let i = 0; i < toRemove.length; i++) {
                let style = toRemove[i], found;
                for (let j = 0; j < matched.length; j++) {
                    let m = matched[j];
                    if (m.step == step - 1 && style.eq(matched[j].style))
                        found = m;
                }
                if (found) {
                    found.to = end;
                    found.step = step;
                }
                else {
                    matched.push({ style, from: Math.max(pos, from), to: end, step });
                }
            }
        }
    });
    matched.forEach(m => tr.step(new RemoveMarkStep(m.from, m.to, m.style)));
}
function clearIncompatible(tr, pos, parentType, match = parentType.contentMatch, clearNewlines = true) {
    let node = tr.doc.nodeAt(pos);
    let replSteps = [], cur = pos + 1;
    for (let i = 0; i < node.childCount; i++) {
        let child = node.child(i), end = cur + child.nodeSize;
        let allowed = match.matchType(child.type);
        if (!allowed) {
            replSteps.push(new ReplaceStep(cur, end, Slice.empty));
        }
        else {
            match = allowed;
            for (let j = 0; j < child.marks.length; j++)
                if (!parentType.allowsMarkType(child.marks[j].type))
                    tr.step(new RemoveMarkStep(cur, end, child.marks[j]));
            if (clearNewlines && child.isText && parentType.whitespace != "pre") {
                let m, newline = /\r?\n|\r/g, slice;
                while (m = newline.exec(child.text)) {
                    if (!slice)
                        slice = new Slice(Fragment.from(parentType.schema.text(" ", parentType.allowedMarks(child.marks))), 0, 0);
                    replSteps.push(new ReplaceStep(cur + m.index, cur + m.index + m[0].length, slice));
                }
            }
        }
        cur = end;
    }
    if (!match.validEnd) {
        let fill = match.fillBefore(Fragment.empty, true);
        tr.replace(cur, cur, new Slice(fill, 0, 0));
    }
    for (let i = replSteps.length - 1; i >= 0; i--)
        tr.step(replSteps[i]);
}

function canCut(node, start, end) {
    return (start == 0 || node.canReplace(start, node.childCount)) &&
        (end == node.childCount || node.canReplace(0, end));
}
/**
Try to find a target depth to which the content in the given range
can be lifted. Will not go across
[isolating](https://prosemirror.net/docs/ref/#model.NodeSpec.isolating) parent nodes.
*/
function liftTarget(range) {
    let parent = range.parent;
    let content = parent.content.cutByIndex(range.startIndex, range.endIndex);
    for (let depth = range.depth;; --depth) {
        let node = range.$from.node(depth);
        let index = range.$from.index(depth), endIndex = range.$to.indexAfter(depth);
        if (depth < range.depth && node.canReplace(index, endIndex, content))
            return depth;
        if (depth == 0 || node.type.spec.isolating || !canCut(node, index, endIndex))
            break;
    }
    return null;
}
function lift(tr, range, target) {
    let { $from, $to, depth } = range;
    let gapStart = $from.before(depth + 1), gapEnd = $to.after(depth + 1);
    let start = gapStart, end = gapEnd;
    let before = Fragment.empty, openStart = 0;
    for (let d = depth, splitting = false; d > target; d--)
        if (splitting || $from.index(d) > 0) {
            splitting = true;
            before = Fragment.from($from.node(d).copy(before));
            openStart++;
        }
        else {
            start--;
        }
    let after = Fragment.empty, openEnd = 0;
    for (let d = depth, splitting = false; d > target; d--)
        if (splitting || $to.after(d + 1) < $to.end(d)) {
            splitting = true;
            after = Fragment.from($to.node(d).copy(after));
            openEnd++;
        }
        else {
            end++;
        }
    tr.step(new ReplaceAroundStep(start, end, gapStart, gapEnd, new Slice(before.append(after), openStart, openEnd), before.size - openStart, true));
}
/**
Try to find a valid way to wrap the content in the given range in a
node of the given type. May introduce extra nodes around and inside
the wrapper node, if necessary. Returns null if no valid wrapping
could be found. When `innerRange` is given, that range's content is
used as the content to fit into the wrapping, instead of the
content of `range`.
*/
function findWrapping(range, nodeType, attrs = null, innerRange = range) {
    let around = findWrappingOutside(range, nodeType);
    let inner = around && findWrappingInside(innerRange, nodeType);
    if (!inner)
        return null;
    return around.map(withAttrs)
        .concat({ type: nodeType, attrs }).concat(inner.map(withAttrs));
}
function withAttrs(type) { return { type, attrs: null }; }
function findWrappingOutside(range, type) {
    let { parent, startIndex, endIndex } = range;
    let around = parent.contentMatchAt(startIndex).findWrapping(type);
    if (!around)
        return null;
    let outer = around.length ? around[0] : type;
    return parent.canReplaceWith(startIndex, endIndex, outer) ? around : null;
}
function findWrappingInside(range, type) {
    let { parent, startIndex, endIndex } = range;
    let inner = parent.child(startIndex);
    let inside = type.contentMatch.findWrapping(inner.type);
    if (!inside)
        return null;
    let lastType = inside.length ? inside[inside.length - 1] : type;
    let innerMatch = lastType.contentMatch;
    for (let i = startIndex; innerMatch && i < endIndex; i++)
        innerMatch = innerMatch.matchType(parent.child(i).type);
    if (!innerMatch || !innerMatch.validEnd)
        return null;
    return inside;
}
function wrap(tr, range, wrappers) {
    let content = Fragment.empty;
    for (let i = wrappers.length - 1; i >= 0; i--) {
        if (content.size) {
            let match = wrappers[i].type.contentMatch.matchFragment(content);
            if (!match || !match.validEnd)
                throw new RangeError("Wrapper type given to Transform.wrap does not form valid content of its parent wrapper");
        }
        content = Fragment.from(wrappers[i].type.create(wrappers[i].attrs, content));
    }
    let start = range.start, end = range.end;
    tr.step(new ReplaceAroundStep(start, end, start, end, new Slice(content, 0, 0), wrappers.length, true));
}
function setBlockType(tr, from, to, type, attrs) {
    if (!type.isTextblock)
        throw new RangeError("Type given to setBlockType should be a textblock");
    let mapFrom = tr.steps.length;
    tr.doc.nodesBetween(from, to, (node, pos) => {
        if (node.isTextblock && !node.hasMarkup(type, attrs) && canChangeType(tr.doc, tr.mapping.slice(mapFrom).map(pos), type)) {
            let convertNewlines = null;
            if (type.schema.linebreakReplacement) {
                let pre = type.whitespace == "pre", supportLinebreak = !!type.contentMatch.matchType(type.schema.linebreakReplacement);
                if (pre && !supportLinebreak)
                    convertNewlines = false;
                else if (!pre && supportLinebreak)
                    convertNewlines = true;
            }
            // Ensure all markup that isn't allowed in the new node type is cleared
            if (convertNewlines === false)
                replaceLinebreaks(tr, node, pos, mapFrom);
            clearIncompatible(tr, tr.mapping.slice(mapFrom).map(pos, 1), type, undefined, convertNewlines === null);
            let mapping = tr.mapping.slice(mapFrom);
            let startM = mapping.map(pos, 1), endM = mapping.map(pos + node.nodeSize, 1);
            tr.step(new ReplaceAroundStep(startM, endM, startM + 1, endM - 1, new Slice(Fragment.from(type.create(attrs, null, node.marks)), 0, 0), 1, true));
            if (convertNewlines === true)
                replaceNewlines(tr, node, pos, mapFrom);
            return false;
        }
    });
}
function replaceNewlines(tr, node, pos, mapFrom) {
    node.forEach((child, offset) => {
        if (child.isText) {
            let m, newline = /\r?\n|\r/g;
            while (m = newline.exec(child.text)) {
                let start = tr.mapping.slice(mapFrom).map(pos + 1 + offset + m.index);
                tr.replaceWith(start, start + 1, node.type.schema.linebreakReplacement.create());
            }
        }
    });
}
function replaceLinebreaks(tr, node, pos, mapFrom) {
    node.forEach((child, offset) => {
        if (child.type == child.type.schema.linebreakReplacement) {
            let start = tr.mapping.slice(mapFrom).map(pos + 1 + offset);
            tr.replaceWith(start, start + 1, node.type.schema.text("\n"));
        }
    });
}
function canChangeType(doc, pos, type) {
    let $pos = doc.resolve(pos), index = $pos.index();
    return $pos.parent.canReplaceWith(index, index + 1, type);
}
/**
Change the type, attributes, and/or marks of the node at `pos`.
When `type` isn't given, the existing node type is preserved,
*/
function setNodeMarkup(tr, pos, type, attrs, marks) {
    let node = tr.doc.nodeAt(pos);
    if (!node)
        throw new RangeError("No node at given position");
    if (!type)
        type = node.type;
    let newNode = type.create(attrs, null, marks || node.marks);
    if (node.isLeaf)
        return tr.replaceWith(pos, pos + node.nodeSize, newNode);
    if (!type.validContent(node.content))
        throw new RangeError("Invalid content for node type " + type.name);
    tr.step(new ReplaceAroundStep(pos, pos + node.nodeSize, pos + 1, pos + node.nodeSize - 1, new Slice(Fragment.from(newNode), 0, 0), 1, true));
}
/**
Check whether splitting at the given position is allowed.
*/
function canSplit(doc, pos, depth = 1, typesAfter) {
    let $pos = doc.resolve(pos), base = $pos.depth - depth;
    let innerType = (typesAfter && typesAfter[typesAfter.length - 1]) || $pos.parent;
    if (base < 0 || $pos.parent.type.spec.isolating ||
        !$pos.parent.canReplace($pos.index(), $pos.parent.childCount) ||
        !innerType.type.validContent($pos.parent.content.cutByIndex($pos.index(), $pos.parent.childCount)))
        return false;
    for (let d = $pos.depth - 1, i = depth - 2; d > base; d--, i--) {
        let node = $pos.node(d), index = $pos.index(d);
        if (node.type.spec.isolating)
            return false;
        let rest = node.content.cutByIndex(index, node.childCount);
        let overrideChild = typesAfter && typesAfter[i + 1];
        if (overrideChild)
            rest = rest.replaceChild(0, overrideChild.type.create(overrideChild.attrs));
        let after = (typesAfter && typesAfter[i]) || node;
        if (!node.canReplace(index + 1, node.childCount) || !after.type.validContent(rest))
            return false;
    }
    let index = $pos.indexAfter(base);
    let baseType = typesAfter && typesAfter[0];
    return $pos.node(base).canReplaceWith(index, index, baseType ? baseType.type : $pos.node(base + 1).type);
}
function split(tr, pos, depth = 1, typesAfter) {
    let $pos = tr.doc.resolve(pos), before = Fragment.empty, after = Fragment.empty;
    for (let d = $pos.depth, e = $pos.depth - depth, i = depth - 1; d > e; d--, i--) {
        before = Fragment.from($pos.node(d).copy(before));
        let typeAfter = typesAfter && typesAfter[i];
        after = Fragment.from(typeAfter ? typeAfter.type.create(typeAfter.attrs, after) : $pos.node(d).copy(after));
    }
    tr.step(new ReplaceStep(pos, pos, new Slice(before.append(after), depth, depth), true));
}
/**
Test whether the blocks before and after a given position can be
joined.
*/
function canJoin(doc, pos) {
    let $pos = doc.resolve(pos), index = $pos.index();
    return joinable($pos.nodeBefore, $pos.nodeAfter) &&
        $pos.parent.canReplace(index, index + 1);
}
function joinable(a, b) {
    return !!(a && b && !a.isLeaf && a.canAppend(b));
}
/**
Find an ancestor of the given position that can be joined to the
block before (or after if `dir` is positive). Returns the joinable
point, if any.
*/
function joinPoint(doc, pos, dir = -1) {
    let $pos = doc.resolve(pos);
    for (let d = $pos.depth;; d--) {
        let before, after, index = $pos.index(d);
        if (d == $pos.depth) {
            before = $pos.nodeBefore;
            after = $pos.nodeAfter;
        }
        else if (dir > 0) {
            before = $pos.node(d + 1);
            index++;
            after = $pos.node(d).maybeChild(index);
        }
        else {
            before = $pos.node(d).maybeChild(index - 1);
            after = $pos.node(d + 1);
        }
        if (before && !before.isTextblock && joinable(before, after) &&
            $pos.node(d).canReplace(index, index + 1))
            return pos;
        if (d == 0)
            break;
        pos = dir < 0 ? $pos.before(d) : $pos.after(d);
    }
}
function join(tr, pos, depth) {
    let step = new ReplaceStep(pos - depth, pos + depth, Slice.empty, true);
    tr.step(step);
}
/**
Try to find a point where a node of the given type can be inserted
near `pos`, by searching up the node hierarchy when `pos` itself
isn't a valid place but is at the start or end of a node. Return
null if no position was found.
*/
function insertPoint(doc, pos, nodeType) {
    let $pos = doc.resolve(pos);
    if ($pos.parent.canReplaceWith($pos.index(), $pos.index(), nodeType))
        return pos;
    if ($pos.parentOffset == 0)
        for (let d = $pos.depth - 1; d >= 0; d--) {
            let index = $pos.index(d);
            if ($pos.node(d).canReplaceWith(index, index, nodeType))
                return $pos.before(d + 1);
            if (index > 0)
                return null;
        }
    if ($pos.parentOffset == $pos.parent.content.size)
        for (let d = $pos.depth - 1; d >= 0; d--) {
            let index = $pos.indexAfter(d);
            if ($pos.node(d).canReplaceWith(index, index, nodeType))
                return $pos.after(d + 1);
            if (index < $pos.node(d).childCount)
                return null;
        }
    return null;
}
/**
Finds a position at or around the given position where the given
slice can be inserted. Will look at parent nodes' nearest boundary
and try there, even if the original position wasn't directly at the
start or end of that node. Returns null when no position was found.
*/
function dropPoint(doc, pos, slice) {
    let $pos = doc.resolve(pos);
    if (!slice.content.size)
        return pos;
    let content = slice.content;
    for (let i = 0; i < slice.openStart; i++)
        content = content.firstChild.content;
    for (let pass = 1; pass <= (slice.openStart == 0 && slice.size ? 2 : 1); pass++) {
        for (let d = $pos.depth; d >= 0; d--) {
            let bias = d == $pos.depth ? 0 : $pos.pos <= ($pos.start(d + 1) + $pos.end(d + 1)) / 2 ? -1 : 1;
            let insertPos = $pos.index(d) + (bias > 0 ? 1 : 0);
            let parent = $pos.node(d), fits = false;
            if (pass == 1) {
                fits = parent.canReplace(insertPos, insertPos, content);
            }
            else {
                let wrapping = parent.contentMatchAt(insertPos).findWrapping(content.firstChild.type);
                fits = wrapping && parent.canReplaceWith(insertPos, insertPos, wrapping[0]);
            }
            if (fits)
                return bias == 0 ? $pos.pos : bias < 0 ? $pos.before(d + 1) : $pos.after(d + 1);
        }
    }
    return null;
}

/**
‘Fit’ a slice into a given position in the document, producing a
[step](https://prosemirror.net/docs/ref/#transform.Step) that inserts it. Will return null if
there's no meaningful way to insert the slice here, or inserting it
would be a no-op (an empty slice over an empty range).
*/
function replaceStep(doc, from, to = from, slice = Slice.empty) {
    if (from == to && !slice.size)
        return null;
    let $from = doc.resolve(from), $to = doc.resolve(to);
    // Optimization -- avoid work if it's obvious that it's not needed.
    if (fitsTrivially($from, $to, slice))
        return new ReplaceStep(from, to, slice);
    return new Fitter($from, $to, slice).fit();
}
function fitsTrivially($from, $to, slice) {
    return !slice.openStart && !slice.openEnd && $from.start() == $to.start() &&
        $from.parent.canReplace($from.index(), $to.index(), slice.content);
}
// Algorithm for 'placing' the elements of a slice into a gap:
//
// We consider the content of each node that is open to the left to be
// independently placeable. I.e. in <p("foo"), p("bar")>, when the
// paragraph on the left is open, "foo" can be placed (somewhere on
// the left side of the replacement gap) independently from p("bar").
//
// This class tracks the state of the placement progress in the
// following properties:
//
//  - `frontier` holds a stack of `{type, match}` objects that
//    represent the open side of the replacement. It starts at
//    `$from`, then moves forward as content is placed, and is finally
//    reconciled with `$to`.
//
//  - `unplaced` is a slice that represents the content that hasn't
//    been placed yet.
//
//  - `placed` is a fragment of placed content. Its open-start value
//    is implicit in `$from`, and its open-end value in `frontier`.
class Fitter {
    constructor($from, $to, unplaced) {
        this.$from = $from;
        this.$to = $to;
        this.unplaced = unplaced;
        this.frontier = [];
        this.placed = Fragment.empty;
        for (let i = 0; i <= $from.depth; i++) {
            let node = $from.node(i);
            this.frontier.push({
                type: node.type,
                match: node.contentMatchAt($from.indexAfter(i))
            });
        }
        for (let i = $from.depth; i > 0; i--)
            this.placed = Fragment.from($from.node(i).copy(this.placed));
    }
    get depth() { return this.frontier.length - 1; }
    fit() {
        // As long as there's unplaced content, try to place some of it.
        // If that fails, either increase the open score of the unplaced
        // slice, or drop nodes from it, and then try again.
        while (this.unplaced.size) {
            let fit = this.findFittable();
            if (fit)
                this.placeNodes(fit);
            else
                this.openMore() || this.dropNode();
        }
        // When there's inline content directly after the frontier _and_
        // directly after `this.$to`, we must generate a `ReplaceAround`
        // step that pulls that content into the node after the frontier.
        // That means the fitting must be done to the end of the textblock
        // node after `this.$to`, not `this.$to` itself.
        let moveInline = this.mustMoveInline(), placedSize = this.placed.size - this.depth - this.$from.depth;
        let $from = this.$from, $to = this.close(moveInline < 0 ? this.$to : $from.doc.resolve(moveInline));
        if (!$to)
            return null;
        // If closing to `$to` succeeded, create a step
        let content = this.placed, openStart = $from.depth, openEnd = $to.depth;
        while (openStart && openEnd && content.childCount == 1) { // Normalize by dropping open parent nodes
            content = content.firstChild.content;
            openStart--;
            openEnd--;
        }
        let slice = new Slice(content, openStart, openEnd);
        if (moveInline > -1)
            return new ReplaceAroundStep($from.pos, moveInline, this.$to.pos, this.$to.end(), slice, placedSize);
        if (slice.size || $from.pos != this.$to.pos) // Don't generate no-op steps
            return new ReplaceStep($from.pos, $to.pos, slice);
        return null;
    }
    // Find a position on the start spine of `this.unplaced` that has
    // content that can be moved somewhere on the frontier. Returns two
    // depths, one for the slice and one for the frontier.
    findFittable() {
        let startDepth = this.unplaced.openStart;
        for (let cur = this.unplaced.content, d = 0, openEnd = this.unplaced.openEnd; d < startDepth; d++) {
            let node = cur.firstChild;
            if (cur.childCount > 1)
                openEnd = 0;
            if (node.type.spec.isolating && openEnd <= d) {
                startDepth = d;
                break;
            }
            cur = node.content;
        }
        // Only try wrapping nodes (pass 2) after finding a place without
        // wrapping failed.
        for (let pass = 1; pass <= 2; pass++) {
            for (let sliceDepth = pass == 1 ? startDepth : this.unplaced.openStart; sliceDepth >= 0; sliceDepth--) {
                let fragment, parent = null;
                if (sliceDepth) {
                    parent = contentAt(this.unplaced.content, sliceDepth - 1).firstChild;
                    fragment = parent.content;
                }
                else {
                    fragment = this.unplaced.content;
                }
                let first = fragment.firstChild;
                for (let frontierDepth = this.depth; frontierDepth >= 0; frontierDepth--) {
                    let { type, match } = this.frontier[frontierDepth], wrap, inject = null;
                    // In pass 1, if the next node matches, or there is no next
                    // node but the parents look compatible, we've found a
                    // place.
                    if (pass == 1 && (first ? match.matchType(first.type) || (inject = match.fillBefore(Fragment.from(first), false))
                        : parent && type.compatibleContent(parent.type)))
                        return { sliceDepth, frontierDepth, parent, inject };
                    // In pass 2, look for a set of wrapping nodes that make
                    // `first` fit here.
                    else if (pass == 2 && first && (wrap = match.findWrapping(first.type)))
                        return { sliceDepth, frontierDepth, parent, wrap };
                    // Don't continue looking further up if the parent node
                    // would fit here.
                    if (parent && match.matchType(parent.type))
                        break;
                }
            }
        }
    }
    openMore() {
        let { content, openStart, openEnd } = this.unplaced;
        let inner = contentAt(content, openStart);
        if (!inner.childCount || inner.firstChild.isLeaf)
            return false;
        this.unplaced = new Slice(content, openStart + 1, Math.max(openEnd, inner.size + openStart >= content.size - openEnd ? openStart + 1 : 0));
        return true;
    }
    dropNode() {
        let { content, openStart, openEnd } = this.unplaced;
        let inner = contentAt(content, openStart);
        if (inner.childCount <= 1 && openStart > 0) {
            let openAtEnd = content.size - openStart <= openStart + inner.size;
            this.unplaced = new Slice(dropFromFragment(content, openStart - 1, 1), openStart - 1, openAtEnd ? openStart - 1 : openEnd);
        }
        else {
            this.unplaced = new Slice(dropFromFragment(content, openStart, 1), openStart, openEnd);
        }
    }
    // Move content from the unplaced slice at `sliceDepth` to the
    // frontier node at `frontierDepth`. Close that frontier node when
    // applicable.
    placeNodes({ sliceDepth, frontierDepth, parent, inject, wrap }) {
        while (this.depth > frontierDepth)
            this.closeFrontierNode();
        if (wrap)
            for (let i = 0; i < wrap.length; i++)
                this.openFrontierNode(wrap[i]);
        let slice = this.unplaced, fragment = parent ? parent.content : slice.content;
        let openStart = slice.openStart - sliceDepth;
        let taken = 0, add = [];
        let { match, type } = this.frontier[frontierDepth];
        if (inject) {
            for (let i = 0; i < inject.childCount; i++)
                add.push(inject.child(i));
            match = match.matchFragment(inject);
        }
        // Computes the amount of (end) open nodes at the end of the
        // fragment. When 0, the parent is open, but no more. When
        // negative, nothing is open.
        let openEndCount = (fragment.size + sliceDepth) - (slice.content.size - slice.openEnd);
        // Scan over the fragment, fitting as many child nodes as
        // possible.
        while (taken < fragment.childCount) {
            let next = fragment.child(taken), matches = match.matchType(next.type);
            if (!matches)
                break;
            taken++;
            if (taken > 1 || openStart == 0 || next.content.size) { // Drop empty open nodes
                match = matches;
                add.push(closeNodeStart(next.mark(type.allowedMarks(next.marks)), taken == 1 ? openStart : 0, taken == fragment.childCount ? openEndCount : -1));
            }
        }
        let toEnd = taken == fragment.childCount;
        if (!toEnd)
            openEndCount = -1;
        this.placed = addToFragment(this.placed, frontierDepth, Fragment.from(add));
        this.frontier[frontierDepth].match = match;
        // If the parent types match, and the entire node was moved, and
        // it's not open, close this frontier node right away.
        if (toEnd && openEndCount < 0 && parent && parent.type == this.frontier[this.depth].type && this.frontier.length > 1)
            this.closeFrontierNode();
        // Add new frontier nodes for any open nodes at the end.
        for (let i = 0, cur = fragment; i < openEndCount; i++) {
            let node = cur.lastChild;
            this.frontier.push({ type: node.type, match: node.contentMatchAt(node.childCount) });
            cur = node.content;
        }
        // Update `this.unplaced`. Drop the entire node from which we
        // placed it we got to its end, otherwise just drop the placed
        // nodes.
        this.unplaced = !toEnd ? new Slice(dropFromFragment(slice.content, sliceDepth, taken), slice.openStart, slice.openEnd)
            : sliceDepth == 0 ? Slice.empty
                : new Slice(dropFromFragment(slice.content, sliceDepth - 1, 1), sliceDepth - 1, openEndCount < 0 ? slice.openEnd : sliceDepth - 1);
    }
    mustMoveInline() {
        if (!this.$to.parent.isTextblock)
            return -1;
        let top = this.frontier[this.depth], level;
        if (!top.type.isTextblock || !contentAfterFits(this.$to, this.$to.depth, top.type, top.match, false) ||
            (this.$to.depth == this.depth && (level = this.findCloseLevel(this.$to)) && level.depth == this.depth))
            return -1;
        let { depth } = this.$to, after = this.$to.after(depth);
        while (depth > 1 && after == this.$to.end(--depth))
            ++after;
        return after;
    }
    findCloseLevel($to) {
        scan: for (let i = Math.min(this.depth, $to.depth); i >= 0; i--) {
            let { match, type } = this.frontier[i];
            let dropInner = i < $to.depth && $to.end(i + 1) == $to.pos + ($to.depth - (i + 1));
            let fit = contentAfterFits($to, i, type, match, dropInner);
            if (!fit)
                continue;
            for (let d = i - 1; d >= 0; d--) {
                let { match, type } = this.frontier[d];
                let matches = contentAfterFits($to, d, type, match, true);
                if (!matches || matches.childCount)
                    continue scan;
            }
            return { depth: i, fit, move: dropInner ? $to.doc.resolve($to.after(i + 1)) : $to };
        }
    }
    close($to) {
        let close = this.findCloseLevel($to);
        if (!close)
            return null;
        while (this.depth > close.depth)
            this.closeFrontierNode();
        if (close.fit.childCount)
            this.placed = addToFragment(this.placed, close.depth, close.fit);
        $to = close.move;
        for (let d = close.depth + 1; d <= $to.depth; d++) {
            let node = $to.node(d), add = node.type.contentMatch.fillBefore(node.content, true, $to.index(d));
            this.openFrontierNode(node.type, node.attrs, add);
        }
        return $to;
    }
    openFrontierNode(type, attrs = null, content) {
        let top = this.frontier[this.depth];
        top.match = top.match.matchType(type);
        this.placed = addToFragment(this.placed, this.depth, Fragment.from(type.create(attrs, content)));
        this.frontier.push({ type, match: type.contentMatch });
    }
    closeFrontierNode() {
        let open = this.frontier.pop();
        let add = open.match.fillBefore(Fragment.empty, true);
        if (add.childCount)
            this.placed = addToFragment(this.placed, this.frontier.length, add);
    }
}
function dropFromFragment(fragment, depth, count) {
    if (depth == 0)
        return fragment.cutByIndex(count, fragment.childCount);
    return fragment.replaceChild(0, fragment.firstChild.copy(dropFromFragment(fragment.firstChild.content, depth - 1, count)));
}
function addToFragment(fragment, depth, content) {
    if (depth == 0)
        return fragment.append(content);
    return fragment.replaceChild(fragment.childCount - 1, fragment.lastChild.copy(addToFragment(fragment.lastChild.content, depth - 1, content)));
}
function contentAt(fragment, depth) {
    for (let i = 0; i < depth; i++)
        fragment = fragment.firstChild.content;
    return fragment;
}
function closeNodeStart(node, openStart, openEnd) {
    if (openStart <= 0)
        return node;
    let frag = node.content;
    if (openStart > 1)
        frag = frag.replaceChild(0, closeNodeStart(frag.firstChild, openStart - 1, frag.childCount == 1 ? openEnd - 1 : 0));
    if (openStart > 0) {
        frag = node.type.contentMatch.fillBefore(frag).append(frag);
        if (openEnd <= 0)
            frag = frag.append(node.type.contentMatch.matchFragment(frag).fillBefore(Fragment.empty, true));
    }
    return node.copy(frag);
}
function contentAfterFits($to, depth, type, match, open) {
    let node = $to.node(depth), index = open ? $to.indexAfter(depth) : $to.index(depth);
    if (index == node.childCount && !type.compatibleContent(node.type))
        return null;
    let fit = match.fillBefore(node.content, true, index);
    return fit && !invalidMarks(type, node.content, index) ? fit : null;
}
function invalidMarks(type, fragment, start) {
    for (let i = start; i < fragment.childCount; i++)
        if (!type.allowsMarks(fragment.child(i).marks))
            return true;
    return false;
}
function definesContent(type) {
    return type.spec.defining || type.spec.definingForContent;
}
function replaceRange(tr, from, to, slice) {
    if (!slice.size)
        return tr.deleteRange(from, to);
    let $from = tr.doc.resolve(from), $to = tr.doc.resolve(to);
    if (fitsTrivially($from, $to, slice))
        return tr.step(new ReplaceStep(from, to, slice));
    let targetDepths = coveredDepths($from, tr.doc.resolve(to));
    // Can't replace the whole document, so remove 0 if it's present
    if (targetDepths[targetDepths.length - 1] == 0)
        targetDepths.pop();
    // Negative numbers represent not expansion over the whole node at
    // that depth, but replacing from $from.before(-D) to $to.pos.
    let preferredTarget = -($from.depth + 1);
    targetDepths.unshift(preferredTarget);
    // This loop picks a preferred target depth, if one of the covering
    // depths is not outside of a defining node, and adds negative
    // depths for any depth that has $from at its start and does not
    // cross a defining node.
    for (let d = $from.depth, pos = $from.pos - 1; d > 0; d--, pos--) {
        let spec = $from.node(d).type.spec;
        if (spec.defining || spec.definingAsContext || spec.isolating)
            break;
        if (targetDepths.indexOf(d) > -1)
            preferredTarget = d;
        else if ($from.before(d) == pos)
            targetDepths.splice(1, 0, -d);
    }
    // Try to fit each possible depth of the slice into each possible
    // target depth, starting with the preferred depths.
    let preferredTargetIndex = targetDepths.indexOf(preferredTarget);
    let leftNodes = [], preferredDepth = slice.openStart;
    for (let content = slice.content, i = 0;; i++) {
        let node = content.firstChild;
        leftNodes.push(node);
        if (i == slice.openStart)
            break;
        content = node.content;
    }
    // Back up preferredDepth to cover defining textblocks directly
    // above it, possibly skipping a non-defining textblock.
    for (let d = preferredDepth - 1; d >= 0; d--) {
        let leftNode = leftNodes[d], def = definesContent(leftNode.type);
        if (def && !leftNode.sameMarkup($from.node(Math.abs(preferredTarget) - 1)))
            preferredDepth = d;
        else if (def || !leftNode.type.isTextblock)
            break;
    }
    for (let j = slice.openStart; j >= 0; j--) {
        let openDepth = (j + preferredDepth + 1) % (slice.openStart + 1);
        let insert = leftNodes[openDepth];
        if (!insert)
            continue;
        for (let i = 0; i < targetDepths.length; i++) {
            // Loop over possible expansion levels, starting with the
            // preferred one
            let targetDepth = targetDepths[(i + preferredTargetIndex) % targetDepths.length], expand = true;
            if (targetDepth < 0) {
                expand = false;
                targetDepth = -targetDepth;
            }
            let parent = $from.node(targetDepth - 1), index = $from.index(targetDepth - 1);
            if (parent.canReplaceWith(index, index, insert.type, insert.marks))
                return tr.replace($from.before(targetDepth), expand ? $to.after(targetDepth) : to, new Slice(closeFragment(slice.content, 0, slice.openStart, openDepth), openDepth, slice.openEnd));
        }
    }
    let startSteps = tr.steps.length;
    for (let i = targetDepths.length - 1; i >= 0; i--) {
        tr.replace(from, to, slice);
        if (tr.steps.length > startSteps)
            break;
        let depth = targetDepths[i];
        if (depth < 0)
            continue;
        from = $from.before(depth);
        to = $to.after(depth);
    }
}
function closeFragment(fragment, depth, oldOpen, newOpen, parent) {
    if (depth < oldOpen) {
        let first = fragment.firstChild;
        fragment = fragment.replaceChild(0, first.copy(closeFragment(first.content, depth + 1, oldOpen, newOpen, first)));
    }
    if (depth > newOpen) {
        let match = parent.contentMatchAt(0);
        let start = match.fillBefore(fragment).append(fragment);
        fragment = start.append(match.matchFragment(start).fillBefore(Fragment.empty, true));
    }
    return fragment;
}
function replaceRangeWith(tr, from, to, node) {
    if (!node.isInline && from == to && tr.doc.resolve(from).parent.content.size) {
        let point = insertPoint(tr.doc, from, node.type);
        if (point != null)
            from = to = point;
    }
    tr.replaceRange(from, to, new Slice(Fragment.from(node), 0, 0));
}
function deleteRange(tr, from, to) {
    let $from = tr.doc.resolve(from), $to = tr.doc.resolve(to);
    let covered = coveredDepths($from, $to);
    for (let i = 0; i < covered.length; i++) {
        let depth = covered[i], last = i == covered.length - 1;
        if ((last && depth == 0) || $from.node(depth).type.contentMatch.validEnd)
            return tr.delete($from.start(depth), $to.end(depth));
        if (depth > 0 && (last || $from.node(depth - 1).canReplace($from.index(depth - 1), $to.indexAfter(depth - 1))))
            return tr.delete($from.before(depth), $to.after(depth));
    }
    for (let d = 1; d <= $from.depth && d <= $to.depth; d++) {
        if (from - $from.start(d) == $from.depth - d && to > $from.end(d) && $to.end(d) - to != $to.depth - d)
            return tr.delete($from.before(d), to);
    }
    tr.delete(from, to);
}
// Returns an array of all depths for which $from - $to spans the
// whole content of the nodes at that depth.
function coveredDepths($from, $to) {
    let result = [], minDepth = Math.min($from.depth, $to.depth);
    for (let d = minDepth; d >= 0; d--) {
        let start = $from.start(d);
        if (start < $from.pos - ($from.depth - d) ||
            $to.end(d) > $to.pos + ($to.depth - d) ||
            $from.node(d).type.spec.isolating ||
            $to.node(d).type.spec.isolating)
            break;
        if (start == $to.start(d) ||
            (d == $from.depth && d == $to.depth && $from.parent.inlineContent && $to.parent.inlineContent &&
                d && $to.start(d - 1) == start - 1))
            result.push(d);
    }
    return result;
}

/**
Update an attribute in a specific node.
*/
class AttrStep extends Step {
    /**
    Construct an attribute step.
    */
    constructor(
    /**
    The position of the target node.
    */
    pos, 
    /**
    The attribute to set.
    */
    attr, 
    // The attribute's new value.
    value) {
        super();
        this.pos = pos;
        this.attr = attr;
        this.value = value;
    }
    apply(doc) {
        let node = doc.nodeAt(this.pos);
        if (!node)
            return StepResult.fail("No node at attribute step's position");
        let attrs = Object.create(null);
        for (let name in node.attrs)
            attrs[name] = node.attrs[name];
        attrs[this.attr] = this.value;
        let updated = node.type.create(attrs, null, node.marks);
        return StepResult.fromReplace(doc, this.pos, this.pos + 1, new Slice(Fragment.from(updated), 0, node.isLeaf ? 0 : 1));
    }
    getMap() {
        return StepMap.empty;
    }
    invert(doc) {
        return new AttrStep(this.pos, this.attr, doc.nodeAt(this.pos).attrs[this.attr]);
    }
    map(mapping) {
        let pos = mapping.mapResult(this.pos, 1);
        return pos.deletedAfter ? null : new AttrStep(pos.pos, this.attr, this.value);
    }
    toJSON() {
        return { stepType: "attr", pos: this.pos, attr: this.attr, value: this.value };
    }
    static fromJSON(schema, json) {
        if (typeof json.pos != "number" || typeof json.attr != "string")
            throw new RangeError("Invalid input for AttrStep.fromJSON");
        return new AttrStep(json.pos, json.attr, json.value);
    }
}
Step.jsonID("attr", AttrStep);
/**
Update an attribute in the doc node.
*/
class DocAttrStep extends Step {
    /**
    Construct an attribute step.
    */
    constructor(
    /**
    The attribute to set.
    */
    attr, 
    // The attribute's new value.
    value) {
        super();
        this.attr = attr;
        this.value = value;
    }
    apply(doc) {
        let attrs = Object.create(null);
        for (let name in doc.attrs)
            attrs[name] = doc.attrs[name];
        attrs[this.attr] = this.value;
        let updated = doc.type.create(attrs, doc.content, doc.marks);
        return StepResult.ok(updated);
    }
    getMap() {
        return StepMap.empty;
    }
    invert(doc) {
        return new DocAttrStep(this.attr, doc.attrs[this.attr]);
    }
    map(mapping) {
        return this;
    }
    toJSON() {
        return { stepType: "docAttr", attr: this.attr, value: this.value };
    }
    static fromJSON(schema, json) {
        if (typeof json.attr != "string")
            throw new RangeError("Invalid input for DocAttrStep.fromJSON");
        return new DocAttrStep(json.attr, json.value);
    }
}
Step.jsonID("docAttr", DocAttrStep);

/**
@internal
*/
let TransformError = class extends Error {
};
TransformError = function TransformError(message) {
    let err = Error.call(this, message);
    err.__proto__ = TransformError.prototype;
    return err;
};
TransformError.prototype = Object.create(Error.prototype);
TransformError.prototype.constructor = TransformError;
TransformError.prototype.name = "TransformError";
/**
Abstraction to build up and track an array of
[steps](https://prosemirror.net/docs/ref/#transform.Step) representing a document transformation.

Most transforming methods return the `Transform` object itself, so
that they can be chained.
*/
class Transform {
    /**
    Create a transform that starts with the given document.
    */
    constructor(
    /**
    The current document (the result of applying the steps in the
    transform).
    */
    doc) {
        this.doc = doc;
        /**
        The steps in this transform.
        */
        this.steps = [];
        /**
        The documents before each of the steps.
        */
        this.docs = [];
        /**
        A mapping with the maps for each of the steps in this transform.
        */
        this.mapping = new Mapping;
    }
    /**
    The starting document.
    */
    get before() { return this.docs.length ? this.docs[0] : this.doc; }
    /**
    Apply a new step in this transform, saving the result. Throws an
    error when the step fails.
    */
    step(step) {
        let result = this.maybeStep(step);
        if (result.failed)
            throw new TransformError(result.failed);
        return this;
    }
    /**
    Try to apply a step in this transformation, ignoring it if it
    fails. Returns the step result.
    */
    maybeStep(step) {
        let result = step.apply(this.doc);
        if (!result.failed)
            this.addStep(step, result.doc);
        return result;
    }
    /**
    True when the document has been changed (when there are any
    steps).
    */
    get docChanged() {
        return this.steps.length > 0;
    }
    /**
    @internal
    */
    addStep(step, doc) {
        this.docs.push(this.doc);
        this.steps.push(step);
        this.mapping.appendMap(step.getMap());
        this.doc = doc;
    }
    /**
    Replace the part of the document between `from` and `to` with the
    given `slice`.
    */
    replace(from, to = from, slice = Slice.empty) {
        let step = replaceStep(this.doc, from, to, slice);
        if (step)
            this.step(step);
        return this;
    }
    /**
    Replace the given range with the given content, which may be a
    fragment, node, or array of nodes.
    */
    replaceWith(from, to, content) {
        return this.replace(from, to, new Slice(Fragment.from(content), 0, 0));
    }
    /**
    Delete the content between the given positions.
    */
    delete(from, to) {
        return this.replace(from, to, Slice.empty);
    }
    /**
    Insert the given content at the given position.
    */
    insert(pos, content) {
        return this.replaceWith(pos, pos, content);
    }
    /**
    Replace a range of the document with a given slice, using
    `from`, `to`, and the slice's
    [`openStart`](https://prosemirror.net/docs/ref/#model.Slice.openStart) property as hints, rather
    than fixed start and end points. This method may grow the
    replaced area or close open nodes in the slice in order to get a
    fit that is more in line with WYSIWYG expectations, by dropping
    fully covered parent nodes of the replaced region when they are
    marked [non-defining as
    context](https://prosemirror.net/docs/ref/#model.NodeSpec.definingAsContext), or including an
    open parent node from the slice that _is_ marked as [defining
    its content](https://prosemirror.net/docs/ref/#model.NodeSpec.definingForContent).
    
    This is the method, for example, to handle paste. The similar
    [`replace`](https://prosemirror.net/docs/ref/#transform.Transform.replace) method is a more
    primitive tool which will _not_ move the start and end of its given
    range, and is useful in situations where you need more precise
    control over what happens.
    */
    replaceRange(from, to, slice) {
        replaceRange(this, from, to, slice);
        return this;
    }
    /**
    Replace the given range with a node, but use `from` and `to` as
    hints, rather than precise positions. When from and to are the same
    and are at the start or end of a parent node in which the given
    node doesn't fit, this method may _move_ them out towards a parent
    that does allow the given node to be placed. When the given range
    completely covers a parent node, this method may completely replace
    that parent node.
    */
    replaceRangeWith(from, to, node) {
        replaceRangeWith(this, from, to, node);
        return this;
    }
    /**
    Delete the given range, expanding it to cover fully covered
    parent nodes until a valid replace is found.
    */
    deleteRange(from, to) {
        deleteRange(this, from, to);
        return this;
    }
    /**
    Split the content in the given range off from its parent, if there
    is sibling content before or after it, and move it up the tree to
    the depth specified by `target`. You'll probably want to use
    [`liftTarget`](https://prosemirror.net/docs/ref/#transform.liftTarget) to compute `target`, to make
    sure the lift is valid.
    */
    lift(range, target) {
        lift(this, range, target);
        return this;
    }
    /**
    Join the blocks around the given position. If depth is 2, their
    last and first siblings are also joined, and so on.
    */
    join(pos, depth = 1) {
        join(this, pos, depth);
        return this;
    }
    /**
    Wrap the given [range](https://prosemirror.net/docs/ref/#model.NodeRange) in the given set of wrappers.
    The wrappers are assumed to be valid in this position, and should
    probably be computed with [`findWrapping`](https://prosemirror.net/docs/ref/#transform.findWrapping).
    */
    wrap(range, wrappers) {
        wrap(this, range, wrappers);
        return this;
    }
    /**
    Set the type of all textblocks (partly) between `from` and `to` to
    the given node type with the given attributes.
    */
    setBlockType(from, to = from, type, attrs = null) {
        setBlockType(this, from, to, type, attrs);
        return this;
    }
    /**
    Change the type, attributes, and/or marks of the node at `pos`.
    When `type` isn't given, the existing node type is preserved,
    */
    setNodeMarkup(pos, type, attrs = null, marks) {
        setNodeMarkup(this, pos, type, attrs, marks);
        return this;
    }
    /**
    Set a single attribute on a given node to a new value.
    The `pos` addresses the document content. Use `setDocAttribute`
    to set attributes on the document itself.
    */
    setNodeAttribute(pos, attr, value) {
        this.step(new AttrStep(pos, attr, value));
        return this;
    }
    /**
    Set a single attribute on the document to a new value.
    */
    setDocAttribute(attr, value) {
        this.step(new DocAttrStep(attr, value));
        return this;
    }
    /**
    Add a mark to the node at position `pos`.
    */
    addNodeMark(pos, mark) {
        this.step(new AddNodeMarkStep(pos, mark));
        return this;
    }
    /**
    Remove a mark (or a mark of the given type) from the node at
    position `pos`.
    */
    removeNodeMark(pos, mark) {
        if (!(mark instanceof Mark)) {
            let node = this.doc.nodeAt(pos);
            if (!node)
                throw new RangeError("No node at position " + pos);
            mark = mark.isInSet(node.marks);
            if (!mark)
                return this;
        }
        this.step(new RemoveNodeMarkStep(pos, mark));
        return this;
    }
    /**
    Split the node at the given position, and optionally, if `depth` is
    greater than one, any number of nodes above that. By default, the
    parts split off will inherit the node type of the original node.
    This can be changed by passing an array of types and attributes to
    use after the split.
    */
    split(pos, depth = 1, typesAfter) {
        split(this, pos, depth, typesAfter);
        return this;
    }
    /**
    Add the given mark to the inline content between `from` and `to`.
    */
    addMark(from, to, mark) {
        addMark(this, from, to, mark);
        return this;
    }
    /**
    Remove marks from inline nodes between `from` and `to`. When
    `mark` is a single mark, remove precisely that mark. When it is
    a mark type, remove all marks of that type. When it is null,
    remove all marks of any type.
    */
    removeMark(from, to, mark) {
        removeMark(this, from, to, mark);
        return this;
    }
    /**
    Removes all marks and nodes from the content of the node at
    `pos` that don't match the given new parent node type. Accepts
    an optional starting [content match](https://prosemirror.net/docs/ref/#model.ContentMatch) as
    third argument.
    */
    clearIncompatible(pos, parentType, match) {
        clearIncompatible(this, pos, parentType, match);
        return this;
    }
}

export { AddMarkStep, AddNodeMarkStep, AttrStep, DocAttrStep, MapResult, Mapping, RemoveMarkStep, RemoveNodeMarkStep, ReplaceAroundStep, ReplaceStep, Step, StepMap, StepResult, Transform, TransformError, canJoin, canSplit, dropPoint, findWrapping, insertPoint, joinPoint, liftTarget, replaceStep };

    global.transform = module.exports || exports;
  })();

  // === ProseMirror: commands$1 (prosemirror-commands.js) ===
  (function() {
    var exports = {};
    var module = { exports: exports };
    import { liftTarget, replaceStep, ReplaceStep, canJoin, joinPoint, canSplit, ReplaceAroundStep, findWrapping } from 'prosemirror-transform';
import { Slice, Fragment } from 'prosemirror-model';
import { NodeSelection, Selection, TextSelection, AllSelection } from 'prosemirror-state';

/**
Delete the selection, if there is one.
*/
const deleteSelection = (state, dispatch) => {
    if (state.selection.empty)
        return false;
    if (dispatch)
        dispatch(state.tr.deleteSelection().scrollIntoView());
    return true;
};
function atBlockStart(state, view) {
    let { $cursor } = state.selection;
    if (!$cursor || (view ? !view.endOfTextblock("backward", state)
        : $cursor.parentOffset > 0))
        return null;
    return $cursor;
}
/**
If the selection is empty and at the start of a textblock, try to
reduce the distance between that block and the one before it—if
there's a block directly before it that can be joined, join them.
If not, try to move the selected block closer to the next one in
the document structure by lifting it out of its parent or moving it
into a parent of the previous block. Will use the view for accurate
(bidi-aware) start-of-textblock detection if given.
*/
const joinBackward = (state, dispatch, view) => {
    let $cursor = atBlockStart(state, view);
    if (!$cursor)
        return false;
    let $cut = findCutBefore($cursor);
    // If there is no node before this, try to lift
    if (!$cut) {
        let range = $cursor.blockRange(), target = range && liftTarget(range);
        if (target == null)
            return false;
        if (dispatch)
            dispatch(state.tr.lift(range, target).scrollIntoView());
        return true;
    }
    let before = $cut.nodeBefore;
    // Apply the joining algorithm
    if (!before.type.spec.isolating && deleteBarrier(state, $cut, dispatch))
        return true;
    // If the node below has no content and the node above is
    // selectable, delete the node below and select the one above.
    if ($cursor.parent.content.size == 0 &&
        (textblockAt(before, "end") || NodeSelection.isSelectable(before))) {
        let delStep = replaceStep(state.doc, $cursor.before(), $cursor.after(), Slice.empty);
        if (delStep && delStep.slice.size < delStep.to - delStep.from) {
            if (dispatch) {
                let tr = state.tr.step(delStep);
                tr.setSelection(textblockAt(before, "end") ? Selection.findFrom(tr.doc.resolve(tr.mapping.map($cut.pos, -1)), -1)
                    : NodeSelection.create(tr.doc, $cut.pos - before.nodeSize));
                dispatch(tr.scrollIntoView());
            }
            return true;
        }
    }
    // If the node before is an atom, delete it
    if (before.isAtom && $cut.depth == $cursor.depth - 1) {
        if (dispatch)
            dispatch(state.tr.delete($cut.pos - before.nodeSize, $cut.pos).scrollIntoView());
        return true;
    }
    return false;
};
/**
A more limited form of [`joinBackward`]($commands.joinBackward)
that only tries to join the current textblock to the one before
it, if the cursor is at the start of a textblock.
*/
const joinTextblockBackward = (state, dispatch, view) => {
    let $cursor = atBlockStart(state, view);
    if (!$cursor)
        return false;
    let $cut = findCutBefore($cursor);
    return $cut ? joinTextblocksAround(state, $cut, dispatch) : false;
};
/**
A more limited form of [`joinForward`]($commands.joinForward)
that only tries to join the current textblock to the one after
it, if the cursor is at the end of a textblock.
*/
const joinTextblockForward = (state, dispatch, view) => {
    let $cursor = atBlockEnd(state, view);
    if (!$cursor)
        return false;
    let $cut = findCutAfter($cursor);
    return $cut ? joinTextblocksAround(state, $cut, dispatch) : false;
};
function joinTextblocksAround(state, $cut, dispatch) {
    let before = $cut.nodeBefore, beforeText = before, beforePos = $cut.pos - 1;
    for (; !beforeText.isTextblock; beforePos--) {
        if (beforeText.type.spec.isolating)
            return false;
        let child = beforeText.lastChild;
        if (!child)
            return false;
        beforeText = child;
    }
    let after = $cut.nodeAfter, afterText = after, afterPos = $cut.pos + 1;
    for (; !afterText.isTextblock; afterPos++) {
        if (afterText.type.spec.isolating)
            return false;
        let child = afterText.firstChild;
        if (!child)
            return false;
        afterText = child;
    }
    let step = replaceStep(state.doc, beforePos, afterPos, Slice.empty);
    if (!step || step.from != beforePos ||
        step instanceof ReplaceStep && step.slice.size >= afterPos - beforePos)
        return false;
    if (dispatch) {
        let tr = state.tr.step(step);
        tr.setSelection(TextSelection.create(tr.doc, beforePos));
        dispatch(tr.scrollIntoView());
    }
    return true;
}
function textblockAt(node, side, only = false) {
    for (let scan = node; scan; scan = (side == "start" ? scan.firstChild : scan.lastChild)) {
        if (scan.isTextblock)
            return true;
        if (only && scan.childCount != 1)
            return false;
    }
    return false;
}
/**
When the selection is empty and at the start of a textblock, select
the node before that textblock, if possible. This is intended to be
bound to keys like backspace, after
[`joinBackward`](https://prosemirror.net/docs/ref/#commands.joinBackward) or other deleting
commands, as a fall-back behavior when the schema doesn't allow
deletion at the selected point.
*/
const selectNodeBackward = (state, dispatch, view) => {
    let { $head, empty } = state.selection, $cut = $head;
    if (!empty)
        return false;
    if ($head.parent.isTextblock) {
        if (view ? !view.endOfTextblock("backward", state) : $head.parentOffset > 0)
            return false;
        $cut = findCutBefore($head);
    }
    let node = $cut && $cut.nodeBefore;
    if (!node || !NodeSelection.isSelectable(node))
        return false;
    if (dispatch)
        dispatch(state.tr.setSelection(NodeSelection.create(state.doc, $cut.pos - node.nodeSize)).scrollIntoView());
    return true;
};
function findCutBefore($pos) {
    if (!$pos.parent.type.spec.isolating)
        for (let i = $pos.depth - 1; i >= 0; i--) {
            if ($pos.index(i) > 0)
                return $pos.doc.resolve($pos.before(i + 1));
            if ($pos.node(i).type.spec.isolating)
                break;
        }
    return null;
}
function atBlockEnd(state, view) {
    let { $cursor } = state.selection;
    if (!$cursor || (view ? !view.endOfTextblock("forward", state)
        : $cursor.parentOffset < $cursor.parent.content.size))
        return null;
    return $cursor;
}
/**
If the selection is empty and the cursor is at the end of a
textblock, try to reduce or remove the boundary between that block
and the one after it, either by joining them or by moving the other
block closer to this one in the tree structure. Will use the view
for accurate start-of-textblock detection if given.
*/
const joinForward = (state, dispatch, view) => {
    let $cursor = atBlockEnd(state, view);
    if (!$cursor)
        return false;
    let $cut = findCutAfter($cursor);
    // If there is no node after this, there's nothing to do
    if (!$cut)
        return false;
    let after = $cut.nodeAfter;
    // Try the joining algorithm
    if (deleteBarrier(state, $cut, dispatch))
        return true;
    // If the node above has no content and the node below is
    // selectable, delete the node above and select the one below.
    if ($cursor.parent.content.size == 0 &&
        (textblockAt(after, "start") || NodeSelection.isSelectable(after))) {
        let delStep = replaceStep(state.doc, $cursor.before(), $cursor.after(), Slice.empty);
        if (delStep && delStep.slice.size < delStep.to - delStep.from) {
            if (dispatch) {
                let tr = state.tr.step(delStep);
                tr.setSelection(textblockAt(after, "start") ? Selection.findFrom(tr.doc.resolve(tr.mapping.map($cut.pos)), 1)
                    : NodeSelection.create(tr.doc, tr.mapping.map($cut.pos)));
                dispatch(tr.scrollIntoView());
            }
            return true;
        }
    }
    // If the next node is an atom, delete it
    if (after.isAtom && $cut.depth == $cursor.depth - 1) {
        if (dispatch)
            dispatch(state.tr.delete($cut.pos, $cut.pos + after.nodeSize).scrollIntoView());
        return true;
    }
    return false;
};
/**
When the selection is empty and at the end of a textblock, select
the node coming after that textblock, if possible. This is intended
to be bound to keys like delete, after
[`joinForward`](https://prosemirror.net/docs/ref/#commands.joinForward) and similar deleting
commands, to provide a fall-back behavior when the schema doesn't
allow deletion at the selected point.
*/
const selectNodeForward = (state, dispatch, view) => {
    let { $head, empty } = state.selection, $cut = $head;
    if (!empty)
        return false;
    if ($head.parent.isTextblock) {
        if (view ? !view.endOfTextblock("forward", state) : $head.parentOffset < $head.parent.content.size)
            return false;
        $cut = findCutAfter($head);
    }
    let node = $cut && $cut.nodeAfter;
    if (!node || !NodeSelection.isSelectable(node))
        return false;
    if (dispatch)
        dispatch(state.tr.setSelection(NodeSelection.create(state.doc, $cut.pos)).scrollIntoView());
    return true;
};
function findCutAfter($pos) {
    if (!$pos.parent.type.spec.isolating)
        for (let i = $pos.depth - 1; i >= 0; i--) {
            let parent = $pos.node(i);
            if ($pos.index(i) + 1 < parent.childCount)
                return $pos.doc.resolve($pos.after(i + 1));
            if (parent.type.spec.isolating)
                break;
        }
    return null;
}
/**
Join the selected block or, if there is a text selection, the
closest ancestor block of the selection that can be joined, with
the sibling above it.
*/
const joinUp = (state, dispatch) => {
    let sel = state.selection, nodeSel = sel instanceof NodeSelection, point;
    if (nodeSel) {
        if (sel.node.isTextblock || !canJoin(state.doc, sel.from))
            return false;
        point = sel.from;
    }
    else {
        point = joinPoint(state.doc, sel.from, -1);
        if (point == null)
            return false;
    }
    if (dispatch) {
        let tr = state.tr.join(point);
        if (nodeSel)
            tr.setSelection(NodeSelection.create(tr.doc, point - state.doc.resolve(point).nodeBefore.nodeSize));
        dispatch(tr.scrollIntoView());
    }
    return true;
};
/**
Join the selected block, or the closest ancestor of the selection
that can be joined, with the sibling after it.
*/
const joinDown = (state, dispatch) => {
    let sel = state.selection, point;
    if (sel instanceof NodeSelection) {
        if (sel.node.isTextblock || !canJoin(state.doc, sel.to))
            return false;
        point = sel.to;
    }
    else {
        point = joinPoint(state.doc, sel.to, 1);
        if (point == null)
            return false;
    }
    if (dispatch)
        dispatch(state.tr.join(point).scrollIntoView());
    return true;
};
/**
Lift the selected block, or the closest ancestor block of the
selection that can be lifted, out of its parent node.
*/
const lift = (state, dispatch) => {
    let { $from, $to } = state.selection;
    let range = $from.blockRange($to), target = range && liftTarget(range);
    if (target == null)
        return false;
    if (dispatch)
        dispatch(state.tr.lift(range, target).scrollIntoView());
    return true;
};
/**
If the selection is in a node whose type has a truthy
[`code`](https://prosemirror.net/docs/ref/#model.NodeSpec.code) property in its spec, replace the
selection with a newline character.
*/
const newlineInCode = (state, dispatch) => {
    let { $head, $anchor } = state.selection;
    if (!$head.parent.type.spec.code || !$head.sameParent($anchor))
        return false;
    if (dispatch)
        dispatch(state.tr.insertText("\n").scrollIntoView());
    return true;
};
function defaultBlockAt(match) {
    for (let i = 0; i < match.edgeCount; i++) {
        let { type } = match.edge(i);
        if (type.isTextblock && !type.hasRequiredAttrs())
            return type;
    }
    return null;
}
/**
When the selection is in a node with a truthy
[`code`](https://prosemirror.net/docs/ref/#model.NodeSpec.code) property in its spec, create a
default block after the code block, and move the cursor there.
*/
const exitCode = (state, dispatch) => {
    let { $head, $anchor } = state.selection;
    if (!$head.parent.type.spec.code || !$head.sameParent($anchor))
        return false;
    let above = $head.node(-1), after = $head.indexAfter(-1), type = defaultBlockAt(above.contentMatchAt(after));
    if (!type || !above.canReplaceWith(after, after, type))
        return false;
    if (dispatch) {
        let pos = $head.after(), tr = state.tr.replaceWith(pos, pos, type.createAndFill());
        tr.setSelection(Selection.near(tr.doc.resolve(pos), 1));
        dispatch(tr.scrollIntoView());
    }
    return true;
};
/**
If a block node is selected, create an empty paragraph before (if
it is its parent's first child) or after it.
*/
const createParagraphNear = (state, dispatch) => {
    let sel = state.selection, { $from, $to } = sel;
    if (sel instanceof AllSelection || $from.parent.inlineContent || $to.parent.inlineContent)
        return false;
    let type = defaultBlockAt($to.parent.contentMatchAt($to.indexAfter()));
    if (!type || !type.isTextblock)
        return false;
    if (dispatch) {
        let side = (!$from.parentOffset && $to.index() < $to.parent.childCount ? $from : $to).pos;
        let tr = state.tr.insert(side, type.createAndFill());
        tr.setSelection(TextSelection.create(tr.doc, side + 1));
        dispatch(tr.scrollIntoView());
    }
    return true;
};
/**
If the cursor is in an empty textblock that can be lifted, lift the
block.
*/
const liftEmptyBlock = (state, dispatch) => {
    let { $cursor } = state.selection;
    if (!$cursor || $cursor.parent.content.size)
        return false;
    if ($cursor.depth > 1 && $cursor.after() != $cursor.end(-1)) {
        let before = $cursor.before();
        if (canSplit(state.doc, before)) {
            if (dispatch)
                dispatch(state.tr.split(before).scrollIntoView());
            return true;
        }
    }
    let range = $cursor.blockRange(), target = range && liftTarget(range);
    if (target == null)
        return false;
    if (dispatch)
        dispatch(state.tr.lift(range, target).scrollIntoView());
    return true;
};
/**
Create a variant of [`splitBlock`](https://prosemirror.net/docs/ref/#commands.splitBlock) that uses
a custom function to determine the type of the newly split off block.
*/
function splitBlockAs(splitNode) {
    return (state, dispatch) => {
        let { $from, $to } = state.selection;
        if (state.selection instanceof NodeSelection && state.selection.node.isBlock) {
            if (!$from.parentOffset || !canSplit(state.doc, $from.pos))
                return false;
            if (dispatch)
                dispatch(state.tr.split($from.pos).scrollIntoView());
            return true;
        }
        if (!$from.parent.isBlock)
            return false;
        if (dispatch) {
            let atEnd = $to.parentOffset == $to.parent.content.size;
            let tr = state.tr;
            if (state.selection instanceof TextSelection || state.selection instanceof AllSelection)
                tr.deleteSelection();
            let deflt = $from.depth == 0 ? null : defaultBlockAt($from.node(-1).contentMatchAt($from.indexAfter(-1)));
            let splitType = splitNode && splitNode($to.parent, atEnd);
            let types = splitType ? [splitType] : atEnd && deflt ? [{ type: deflt }] : undefined;
            let can = canSplit(tr.doc, tr.mapping.map($from.pos), 1, types);
            if (!types && !can && canSplit(tr.doc, tr.mapping.map($from.pos), 1, deflt ? [{ type: deflt }] : undefined)) {
                if (deflt)
                    types = [{ type: deflt }];
                can = true;
            }
            if (can) {
                tr.split(tr.mapping.map($from.pos), 1, types);
                if (!atEnd && !$from.parentOffset && $from.parent.type != deflt) {
                    let first = tr.mapping.map($from.before()), $first = tr.doc.resolve(first);
                    if (deflt && $from.node(-1).canReplaceWith($first.index(), $first.index() + 1, deflt))
                        tr.setNodeMarkup(tr.mapping.map($from.before()), deflt);
                }
            }
            dispatch(tr.scrollIntoView());
        }
        return true;
    };
}
/**
Split the parent block of the selection. If the selection is a text
selection, also delete its content.
*/
const splitBlock = splitBlockAs();
/**
Acts like [`splitBlock`](https://prosemirror.net/docs/ref/#commands.splitBlock), but without
resetting the set of active marks at the cursor.
*/
const splitBlockKeepMarks = (state, dispatch) => {
    return splitBlock(state, dispatch && (tr => {
        let marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());
        if (marks)
            tr.ensureMarks(marks);
        dispatch(tr);
    }));
};
/**
Move the selection to the node wrapping the current selection, if
any. (Will not select the document node.)
*/
const selectParentNode = (state, dispatch) => {
    let { $from, to } = state.selection, pos;
    let same = $from.sharedDepth(to);
    if (same == 0)
        return false;
    pos = $from.before(same);
    if (dispatch)
        dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
    return true;
};
/**
Select the whole document.
*/
const selectAll = (state, dispatch) => {
    if (dispatch)
        dispatch(state.tr.setSelection(new AllSelection(state.doc)));
    return true;
};
function joinMaybeClear(state, $pos, dispatch) {
    let before = $pos.nodeBefore, after = $pos.nodeAfter, index = $pos.index();
    if (!before || !after || !before.type.compatibleContent(after.type))
        return false;
    if (!before.content.size && $pos.parent.canReplace(index - 1, index)) {
        if (dispatch)
            dispatch(state.tr.delete($pos.pos - before.nodeSize, $pos.pos).scrollIntoView());
        return true;
    }
    if (!$pos.parent.canReplace(index, index + 1) || !(after.isTextblock || canJoin(state.doc, $pos.pos)))
        return false;
    if (dispatch)
        dispatch(state.tr
            .clearIncompatible($pos.pos, before.type, before.contentMatchAt(before.childCount))
            .join($pos.pos)
            .scrollIntoView());
    return true;
}
function deleteBarrier(state, $cut, dispatch) {
    let before = $cut.nodeBefore, after = $cut.nodeAfter, conn, match;
    if (before.type.spec.isolating || after.type.spec.isolating)
        return false;
    if (joinMaybeClear(state, $cut, dispatch))
        return true;
    let canDelAfter = $cut.parent.canReplace($cut.index(), $cut.index() + 1);
    if (canDelAfter &&
        (conn = (match = before.contentMatchAt(before.childCount)).findWrapping(after.type)) &&
        match.matchType(conn[0] || after.type).validEnd) {
        if (dispatch) {
            let end = $cut.pos + after.nodeSize, wrap = Fragment.empty;
            for (let i = conn.length - 1; i >= 0; i--)
                wrap = Fragment.from(conn[i].create(null, wrap));
            wrap = Fragment.from(before.copy(wrap));
            let tr = state.tr.step(new ReplaceAroundStep($cut.pos - 1, end, $cut.pos, end, new Slice(wrap, 1, 0), conn.length, true));
            let joinAt = end + 2 * conn.length;
            if (canJoin(tr.doc, joinAt))
                tr.join(joinAt);
            dispatch(tr.scrollIntoView());
        }
        return true;
    }
    let selAfter = Selection.findFrom($cut, 1);
    let range = selAfter && selAfter.$from.blockRange(selAfter.$to), target = range && liftTarget(range);
    if (target != null && target >= $cut.depth) {
        if (dispatch)
            dispatch(state.tr.lift(range, target).scrollIntoView());
        return true;
    }
    if (canDelAfter && textblockAt(after, "start", true) && textblockAt(before, "end")) {
        let at = before, wrap = [];
        for (;;) {
            wrap.push(at);
            if (at.isTextblock)
                break;
            at = at.lastChild;
        }
        let afterText = after, afterDepth = 1;
        for (; !afterText.isTextblock; afterText = afterText.firstChild)
            afterDepth++;
        if (at.canReplace(at.childCount, at.childCount, afterText.content)) {
            if (dispatch) {
                let end = Fragment.empty;
                for (let i = wrap.length - 1; i >= 0; i--)
                    end = Fragment.from(wrap[i].copy(end));
                let tr = state.tr.step(new ReplaceAroundStep($cut.pos - wrap.length, $cut.pos + after.nodeSize, $cut.pos + afterDepth, $cut.pos + after.nodeSize - afterDepth, new Slice(end, wrap.length, 0), 0, true));
                dispatch(tr.scrollIntoView());
            }
            return true;
        }
    }
    return false;
}
function selectTextblockSide(side) {
    return function (state, dispatch) {
        let sel = state.selection, $pos = side < 0 ? sel.$from : sel.$to;
        let depth = $pos.depth;
        while ($pos.node(depth).isInline) {
            if (!depth)
                return false;
            depth--;
        }
        if (!$pos.node(depth).isTextblock)
            return false;
        if (dispatch)
            dispatch(state.tr.setSelection(TextSelection.create(state.doc, side < 0 ? $pos.start(depth) : $pos.end(depth))));
        return true;
    };
}
/**
Moves the cursor to the start of current text block.
*/
const selectTextblockStart = selectTextblockSide(-1);
/**
Moves the cursor to the end of current text block.
*/
const selectTextblockEnd = selectTextblockSide(1);
// Parameterized commands
/**
Wrap the selection in a node of the given type with the given
attributes.
*/
function wrapIn(nodeType, attrs = null) {
    return function (state, dispatch) {
        let { $from, $to } = state.selection;
        let range = $from.blockRange($to), wrapping = range && findWrapping(range, nodeType, attrs);
        if (!wrapping)
            return false;
        if (dispatch)
            dispatch(state.tr.wrap(range, wrapping).scrollIntoView());
        return true;
    };
}
/**
Returns a command that tries to set the selected textblocks to the
given node type with the given attributes.
*/
function setBlockType(nodeType, attrs = null) {
    return function (state, dispatch) {
        let applicable = false;
        for (let i = 0; i < state.selection.ranges.length && !applicable; i++) {
            let { $from: { pos: from }, $to: { pos: to } } = state.selection.ranges[i];
            state.doc.nodesBetween(from, to, (node, pos) => {
                if (applicable)
                    return false;
                if (!node.isTextblock || node.hasMarkup(nodeType, attrs))
                    return;
                if (node.type == nodeType) {
                    applicable = true;
                }
                else {
                    let $pos = state.doc.resolve(pos), index = $pos.index();
                    applicable = $pos.parent.canReplaceWith(index, index + 1, nodeType);
                }
            });
        }
        if (!applicable)
            return false;
        if (dispatch) {
            let tr = state.tr;
            for (let i = 0; i < state.selection.ranges.length; i++) {
                let { $from: { pos: from }, $to: { pos: to } } = state.selection.ranges[i];
                tr.setBlockType(from, to, nodeType, attrs);
            }
            dispatch(tr.scrollIntoView());
        }
        return true;
    };
}
function markApplies(doc, ranges, type) {
    for (let i = 0; i < ranges.length; i++) {
        let { $from, $to } = ranges[i];
        let can = $from.depth == 0 ? doc.inlineContent && doc.type.allowsMarkType(type) : false;
        doc.nodesBetween($from.pos, $to.pos, node => {
            if (can)
                return false;
            can = node.inlineContent && node.type.allowsMarkType(type);
        });
        if (can)
            return true;
    }
    return false;
}
/**
Create a command function that toggles the given mark with the
given attributes. Will return `false` when the current selection
doesn't support that mark. This will remove the mark if any marks
of that type exist in the selection, or add it otherwise. If the
selection is empty, this applies to the [stored
marks](https://prosemirror.net/docs/ref/#state.EditorState.storedMarks) instead of a range of the
document.
*/
function toggleMark(markType, attrs = null) {
    return function (state, dispatch) {
        let { empty, $cursor, ranges } = state.selection;
        if ((empty && !$cursor) || !markApplies(state.doc, ranges, markType))
            return false;
        if (dispatch) {
            if ($cursor) {
                if (markType.isInSet(state.storedMarks || $cursor.marks()))
                    dispatch(state.tr.removeStoredMark(markType));
                else
                    dispatch(state.tr.addStoredMark(markType.create(attrs)));
            }
            else {
                let has = false, tr = state.tr;
                for (let i = 0; !has && i < ranges.length; i++) {
                    let { $from, $to } = ranges[i];
                    has = state.doc.rangeHasMark($from.pos, $to.pos, markType);
                }
                for (let i = 0; i < ranges.length; i++) {
                    let { $from, $to } = ranges[i];
                    if (has) {
                        tr.removeMark($from.pos, $to.pos, markType);
                    }
                    else {
                        let from = $from.pos, to = $to.pos, start = $from.nodeAfter, end = $to.nodeBefore;
                        let spaceStart = start && start.isText ? /^\s*/.exec(start.text)[0].length : 0;
                        let spaceEnd = end && end.isText ? /\s*$/.exec(end.text)[0].length : 0;
                        if (from + spaceStart < to) {
                            from += spaceStart;
                            to -= spaceEnd;
                        }
                        tr.addMark(from, to, markType.create(attrs));
                    }
                }
                dispatch(tr.scrollIntoView());
            }
        }
        return true;
    };
}
function wrapDispatchForJoin(dispatch, isJoinable) {
    return (tr) => {
        if (!tr.isGeneric)
            return dispatch(tr);
        let ranges = [];
        for (let i = 0; i < tr.mapping.maps.length; i++) {
            let map = tr.mapping.maps[i];
            for (let j = 0; j < ranges.length; j++)
                ranges[j] = map.map(ranges[j]);
            map.forEach((_s, _e, from, to) => ranges.push(from, to));
        }
        // Figure out which joinable points exist inside those ranges,
        // by checking all node boundaries in their parent nodes.
        let joinable = [];
        for (let i = 0; i < ranges.length; i += 2) {
            let from = ranges[i], to = ranges[i + 1];
            let $from = tr.doc.resolve(from), depth = $from.sharedDepth(to), parent = $from.node(depth);
            for (let index = $from.indexAfter(depth), pos = $from.after(depth + 1); pos <= to; ++index) {
                let after = parent.maybeChild(index);
                if (!after)
                    break;
                if (index && joinable.indexOf(pos) == -1) {
                    let before = parent.child(index - 1);
                    if (before.type == after.type && isJoinable(before, after))
                        joinable.push(pos);
                }
                pos += after.nodeSize;
            }
        }
        // Join the joinable points
        joinable.sort((a, b) => a - b);
        for (let i = joinable.length - 1; i >= 0; i--) {
            if (canJoin(tr.doc, joinable[i]))
                tr.join(joinable[i]);
        }
        dispatch(tr);
    };
}
/**
Wrap a command so that, when it produces a transform that causes
two joinable nodes to end up next to each other, those are joined.
Nodes are considered joinable when they are of the same type and
when the `isJoinable` predicate returns true for them or, if an
array of strings was passed, if their node type name is in that
array.
*/
function autoJoin(command, isJoinable) {
    let canJoin = Array.isArray(isJoinable) ? (node) => isJoinable.indexOf(node.type.name) > -1
        : isJoinable;
    return (state, dispatch, view) => command(state, dispatch && wrapDispatchForJoin(dispatch, canJoin), view);
}
/**
Combine a number of command functions into a single function (which
calls them one by one until one returns true).
*/
function chainCommands(...commands) {
    return function (state, dispatch, view) {
        for (let i = 0; i < commands.length; i++)
            if (commands[i](state, dispatch, view))
                return true;
        return false;
    };
}
let backspace = chainCommands(deleteSelection, joinBackward, selectNodeBackward);
let del = chainCommands(deleteSelection, joinForward, selectNodeForward);
/**
A basic keymap containing bindings not specific to any schema.
Binds the following keys (when multiple commands are listed, they
are chained with [`chainCommands`](https://prosemirror.net/docs/ref/#commands.chainCommands)):

* **Enter** to `newlineInCode`, `createParagraphNear`, `liftEmptyBlock`, `splitBlock`
* **Mod-Enter** to `exitCode`
* **Backspace** and **Mod-Backspace** to `deleteSelection`, `joinBackward`, `selectNodeBackward`
* **Delete** and **Mod-Delete** to `deleteSelection`, `joinForward`, `selectNodeForward`
* **Mod-Delete** to `deleteSelection`, `joinForward`, `selectNodeForward`
* **Mod-a** to `selectAll`
*/
const pcBaseKeymap = {
    "Enter": chainCommands(newlineInCode, createParagraphNear, liftEmptyBlock, splitBlock),
    "Mod-Enter": exitCode,
    "Backspace": backspace,
    "Mod-Backspace": backspace,
    "Shift-Backspace": backspace,
    "Delete": del,
    "Mod-Delete": del,
    "Mod-a": selectAll
};
/**
A copy of `pcBaseKeymap` that also binds **Ctrl-h** like Backspace,
**Ctrl-d** like Delete, **Alt-Backspace** like Ctrl-Backspace, and
**Ctrl-Alt-Backspace**, **Alt-Delete**, and **Alt-d** like
Ctrl-Delete.
*/
const macBaseKeymap = {
    "Ctrl-h": pcBaseKeymap["Backspace"],
    "Alt-Backspace": pcBaseKeymap["Mod-Backspace"],
    "Ctrl-d": pcBaseKeymap["Delete"],
    "Ctrl-Alt-Backspace": pcBaseKeymap["Mod-Delete"],
    "Alt-Delete": pcBaseKeymap["Mod-Delete"],
    "Alt-d": pcBaseKeymap["Mod-Delete"],
    "Ctrl-a": selectTextblockStart,
    "Ctrl-e": selectTextblockEnd
};
for (let key in pcBaseKeymap)
    macBaseKeymap[key] = pcBaseKeymap[key];
const mac = typeof navigator != "undefined" ? /Mac|iP(hone|[oa]d)/.test(navigator.platform)
    // @ts-ignore
    : typeof os != "undefined" && os.platform ? os.platform() == "darwin" : false;
/**
Depending on the detected platform, this will hold
[`pcBasekeymap`](https://prosemirror.net/docs/ref/#commands.pcBaseKeymap) or
[`macBaseKeymap`](https://prosemirror.net/docs/ref/#commands.macBaseKeymap).
*/
const baseKeymap = mac ? macBaseKeymap : pcBaseKeymap;

export { autoJoin, baseKeymap, chainCommands, createParagraphNear, deleteSelection, exitCode, joinBackward, joinDown, joinForward, joinTextblockBackward, joinTextblockForward, joinUp, lift, liftEmptyBlock, macBaseKeymap, newlineInCode, pcBaseKeymap, selectAll, selectNodeBackward, selectNodeForward, selectParentNode, selectTextblockEnd, selectTextblockStart, setBlockType, splitBlock, splitBlockAs, splitBlockKeepMarks, toggleMark, wrapIn };

    global.commands$1 = module.exports || exports;
  })();

  // === ProseMirror: schemaList (prosemirror-schema-list.js) ===
  (function() {
    var exports = {};
    var module = { exports: exports };
    import { findWrapping, ReplaceAroundStep, canSplit, liftTarget, canJoin } from 'prosemirror-transform';
import { NodeRange, Fragment, Slice } from 'prosemirror-model';
import { Selection } from 'prosemirror-state';

const olDOM = ["ol", 0], ulDOM = ["ul", 0], liDOM = ["li", 0];
/**
An ordered list [node spec](https://prosemirror.net/docs/ref/#model.NodeSpec). Has a single
attribute, `order`, which determines the number at which the list
starts counting, and defaults to 1. Represented as an `<ol>`
element.
*/
const orderedList = {
    attrs: { order: { default: 1 } },
    parseDOM: [{ tag: "ol", getAttrs(dom) {
                return { order: dom.hasAttribute("start") ? +dom.getAttribute("start") : 1 };
            } }],
    toDOM(node) {
        return node.attrs.order == 1 ? olDOM : ["ol", { start: node.attrs.order }, 0];
    }
};
/**
A bullet list node spec, represented in the DOM as `<ul>`.
*/
const bulletList = {
    parseDOM: [{ tag: "ul" }],
    toDOM() { return ulDOM; }
};
/**
A list item (`<li>`) spec.
*/
const listItem = {
    parseDOM: [{ tag: "li" }],
    toDOM() { return liDOM; },
    defining: true
};
function add(obj, props) {
    let copy = {};
    for (let prop in obj)
        copy[prop] = obj[prop];
    for (let prop in props)
        copy[prop] = props[prop];
    return copy;
}
/**
Convenience function for adding list-related node types to a map
specifying the nodes for a schema. Adds
[`orderedList`](https://prosemirror.net/docs/ref/#schema-list.orderedList) as `"ordered_list"`,
[`bulletList`](https://prosemirror.net/docs/ref/#schema-list.bulletList) as `"bullet_list"`, and
[`listItem`](https://prosemirror.net/docs/ref/#schema-list.listItem) as `"list_item"`.

`itemContent` determines the content expression for the list items.
If you want the commands defined in this module to apply to your
list structure, it should have a shape like `"paragraph block*"` or
`"paragraph (ordered_list | bullet_list)*"`. `listGroup` can be
given to assign a group name to the list node types, for example
`"block"`.
*/
function addListNodes(nodes, itemContent, listGroup) {
    return nodes.append({
        ordered_list: add(orderedList, { content: "list_item+", group: listGroup }),
        bullet_list: add(bulletList, { content: "list_item+", group: listGroup }),
        list_item: add(listItem, { content: itemContent })
    });
}
/**
Returns a command function that wraps the selection in a list with
the given type an attributes. If `dispatch` is null, only return a
value to indicate whether this is possible, but don't actually
perform the change.
*/
function wrapInList(listType, attrs = null) {
    return function (state, dispatch) {
        let { $from, $to } = state.selection;
        let range = $from.blockRange($to), doJoin = false, outerRange = range;
        if (!range)
            return false;
        // This is at the top of an existing list item
        if (range.depth >= 2 && $from.node(range.depth - 1).type.compatibleContent(listType) && range.startIndex == 0) {
            // Don't do anything if this is the top of the list
            if ($from.index(range.depth - 1) == 0)
                return false;
            let $insert = state.doc.resolve(range.start - 2);
            outerRange = new NodeRange($insert, $insert, range.depth);
            if (range.endIndex < range.parent.childCount)
                range = new NodeRange($from, state.doc.resolve($to.end(range.depth)), range.depth);
            doJoin = true;
        }
        let wrap = findWrapping(outerRange, listType, attrs, range);
        if (!wrap)
            return false;
        if (dispatch)
            dispatch(doWrapInList(state.tr, range, wrap, doJoin, listType).scrollIntoView());
        return true;
    };
}
function doWrapInList(tr, range, wrappers, joinBefore, listType) {
    let content = Fragment.empty;
    for (let i = wrappers.length - 1; i >= 0; i--)
        content = Fragment.from(wrappers[i].type.create(wrappers[i].attrs, content));
    tr.step(new ReplaceAroundStep(range.start - (joinBefore ? 2 : 0), range.end, range.start, range.end, new Slice(content, 0, 0), wrappers.length, true));
    let found = 0;
    for (let i = 0; i < wrappers.length; i++)
        if (wrappers[i].type == listType)
            found = i + 1;
    let splitDepth = wrappers.length - found;
    let splitPos = range.start + wrappers.length - (joinBefore ? 2 : 0), parent = range.parent;
    for (let i = range.startIndex, e = range.endIndex, first = true; i < e; i++, first = false) {
        if (!first && canSplit(tr.doc, splitPos, splitDepth)) {
            tr.split(splitPos, splitDepth);
            splitPos += 2 * splitDepth;
        }
        splitPos += parent.child(i).nodeSize;
    }
    return tr;
}
/**
Build a command that splits a non-empty textblock at the top level
of a list item by also splitting that list item.
*/
function splitListItem(itemType, itemAttrs) {
    return function (state, dispatch) {
        let { $from, $to, node } = state.selection;
        if ((node && node.isBlock) || $from.depth < 2 || !$from.sameParent($to))
            return false;
        let grandParent = $from.node(-1);
        if (grandParent.type != itemType)
            return false;
        if ($from.parent.content.size == 0 && $from.node(-1).childCount == $from.indexAfter(-1)) {
            // In an empty block. If this is a nested list, the wrapping
            // list item should be split. Otherwise, bail out and let next
            // command handle lifting.
            if ($from.depth == 3 || $from.node(-3).type != itemType ||
                $from.index(-2) != $from.node(-2).childCount - 1)
                return false;
            if (dispatch) {
                let wrap = Fragment.empty;
                let depthBefore = $from.index(-1) ? 1 : $from.index(-2) ? 2 : 3;
                // Build a fragment containing empty versions of the structure
                // from the outer list item to the parent node of the cursor
                for (let d = $from.depth - depthBefore; d >= $from.depth - 3; d--)
                    wrap = Fragment.from($from.node(d).copy(wrap));
                let depthAfter = $from.indexAfter(-1) < $from.node(-2).childCount ? 1
                    : $from.indexAfter(-2) < $from.node(-3).childCount ? 2 : 3;
                // Add a second list item with an empty default start node
                wrap = wrap.append(Fragment.from(itemType.createAndFill()));
                let start = $from.before($from.depth - (depthBefore - 1));
                let tr = state.tr.replace(start, $from.after(-depthAfter), new Slice(wrap, 4 - depthBefore, 0));
                let sel = -1;
                tr.doc.nodesBetween(start, tr.doc.content.size, (node, pos) => {
                    if (sel > -1)
                        return false;
                    if (node.isTextblock && node.content.size == 0)
                        sel = pos + 1;
                });
                if (sel > -1)
                    tr.setSelection(Selection.near(tr.doc.resolve(sel)));
                dispatch(tr.scrollIntoView());
            }
            return true;
        }
        let nextType = $to.pos == $from.end() ? grandParent.contentMatchAt(0).defaultType : null;
        let tr = state.tr.delete($from.pos, $to.pos);
        let types = nextType ? [itemAttrs ? { type: itemType, attrs: itemAttrs } : null, { type: nextType }] : undefined;
        if (!canSplit(tr.doc, $from.pos, 2, types))
            return false;
        if (dispatch)
            dispatch(tr.split($from.pos, 2, types).scrollIntoView());
        return true;
    };
}
/**
Acts like [`splitListItem`](https://prosemirror.net/docs/ref/#schema-list.splitListItem), but
without resetting the set of active marks at the cursor.
*/
function splitListItemKeepMarks(itemType, itemAttrs) {
    let split = splitListItem(itemType, itemAttrs);
    return (state, dispatch) => {
        return split(state, dispatch && (tr => {
            let marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());
            if (marks)
                tr.ensureMarks(marks);
            dispatch(tr);
        }));
    };
}
/**
Create a command to lift the list item around the selection up into
a wrapping list.
*/
function liftListItem(itemType) {
    return function (state, dispatch) {
        let { $from, $to } = state.selection;
        let range = $from.blockRange($to, node => node.childCount > 0 && node.firstChild.type == itemType);
        if (!range)
            return false;
        if (!dispatch)
            return true;
        if ($from.node(range.depth - 1).type == itemType) // Inside a parent list
            return liftToOuterList(state, dispatch, itemType, range);
        else // Outer list node
            return liftOutOfList(state, dispatch, range);
    };
}
function liftToOuterList(state, dispatch, itemType, range) {
    let tr = state.tr, end = range.end, endOfList = range.$to.end(range.depth);
    if (end < endOfList) {
        // There are siblings after the lifted items, which must become
        // children of the last item
        tr.step(new ReplaceAroundStep(end - 1, endOfList, end, endOfList, new Slice(Fragment.from(itemType.create(null, range.parent.copy())), 1, 0), 1, true));
        range = new NodeRange(tr.doc.resolve(range.$from.pos), tr.doc.resolve(endOfList), range.depth);
    }
    const target = liftTarget(range);
    if (target == null)
        return false;
    tr.lift(range, target);
    let after = tr.mapping.map(end, -1) - 1;
    if (canJoin(tr.doc, after))
        tr.join(after);
    dispatch(tr.scrollIntoView());
    return true;
}
function liftOutOfList(state, dispatch, range) {
    let tr = state.tr, list = range.parent;
    // Merge the list items into a single big item
    for (let pos = range.end, i = range.endIndex - 1, e = range.startIndex; i > e; i--) {
        pos -= list.child(i).nodeSize;
        tr.delete(pos - 1, pos + 1);
    }
    let $start = tr.doc.resolve(range.start), item = $start.nodeAfter;
    if (tr.mapping.map(range.end) != range.start + $start.nodeAfter.nodeSize)
        return false;
    let atStart = range.startIndex == 0, atEnd = range.endIndex == list.childCount;
    let parent = $start.node(-1), indexBefore = $start.index(-1);
    if (!parent.canReplace(indexBefore + (atStart ? 0 : 1), indexBefore + 1, item.content.append(atEnd ? Fragment.empty : Fragment.from(list))))
        return false;
    let start = $start.pos, end = start + item.nodeSize;
    // Strip off the surrounding list. At the sides where we're not at
    // the end of the list, the existing list is closed. At sides where
    // this is the end, it is overwritten to its end.
    tr.step(new ReplaceAroundStep(start - (atStart ? 1 : 0), end + (atEnd ? 1 : 0), start + 1, end - 1, new Slice((atStart ? Fragment.empty : Fragment.from(list.copy(Fragment.empty)))
        .append(atEnd ? Fragment.empty : Fragment.from(list.copy(Fragment.empty))), atStart ? 0 : 1, atEnd ? 0 : 1), atStart ? 0 : 1));
    dispatch(tr.scrollIntoView());
    return true;
}
/**
Create a command to sink the list item around the selection down
into an inner list.
*/
function sinkListItem(itemType) {
    return function (state, dispatch) {
        let { $from, $to } = state.selection;
        let range = $from.blockRange($to, node => node.childCount > 0 && node.firstChild.type == itemType);
        if (!range)
            return false;
        let startIndex = range.startIndex;
        if (startIndex == 0)
            return false;
        let parent = range.parent, nodeBefore = parent.child(startIndex - 1);
        if (nodeBefore.type != itemType)
            return false;
        if (dispatch) {
            let nestedBefore = nodeBefore.lastChild && nodeBefore.lastChild.type == parent.type;
            let inner = Fragment.from(nestedBefore ? itemType.create() : null);
            let slice = new Slice(Fragment.from(itemType.create(null, Fragment.from(parent.type.create(null, inner)))), nestedBefore ? 3 : 1, 0);
            let before = range.start, after = range.end;
            dispatch(state.tr.step(new ReplaceAroundStep(before - (nestedBefore ? 3 : 1), after, before, after, slice, 1, true))
                .scrollIntoView());
        }
        return true;
    };
}

export { addListNodes, bulletList, liftListItem, listItem, orderedList, sinkListItem, splitListItem, splitListItemKeepMarks, wrapInList };

    global.schemaList = module.exports || exports;
  })();

  // === Tiptap Core ===
  (function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tiptap/pm/state'), require('@tiptap/pm/view'), require('@tiptap/pm/keymap'), require('@tiptap/pm/model'), require('@tiptap/pm/transform'), require('@tiptap/pm/commands'), require('@tiptap/pm/schema-list')) :
  typeof define === 'function' && define.amd ? define(['exports', '@tiptap/pm/state', '@tiptap/pm/view', '@tiptap/pm/keymap', '@tiptap/pm/model', '@tiptap/pm/transform', '@tiptap/pm/commands', '@tiptap/pm/schema-list'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["@tiptap/core"] = {}, global.state, global.view, global.keymap, global.model, global.transform, global.commands$1, global.schemaList));
})(this, (function (exports, state, view, keymap, model, transform, commands$1, schemaList) { 'use strict';

  /**
   * Takes a Transaction & Editor State and turns it into a chainable state object
   * @param config The transaction and state to create the chainable state from
   * @returns A chainable Editor state object
   */
  function createChainableState(config) {
      const { state, transaction } = config;
      let { selection } = transaction;
      let { doc } = transaction;
      let { storedMarks } = transaction;
      return {
          ...state,
          apply: state.apply.bind(state),
          applyTransaction: state.applyTransaction.bind(state),
          plugins: state.plugins,
          schema: state.schema,
          reconfigure: state.reconfigure.bind(state),
          toJSON: state.toJSON.bind(state),
          get storedMarks() {
              return storedMarks;
          },
          get selection() {
              return selection;
          },
          get doc() {
              return doc;
          },
          get tr() {
              selection = transaction.selection;
              doc = transaction.doc;
              storedMarks = transaction.storedMarks;
              return transaction;
          },
      };
  }

  class CommandManager {
      constructor(props) {
          this.editor = props.editor;
          this.rawCommands = this.editor.extensionManager.commands;
          this.customState = props.state;
      }
      get hasCustomState() {
          return !!this.customState;
      }
      get state() {
          return this.customState || this.editor.state;
      }
      get commands() {
          const { rawCommands, editor, state } = this;
          const { view } = editor;
          const { tr } = state;
          const props = this.buildProps(tr);
          return Object.fromEntries(Object.entries(rawCommands).map(([name, command]) => {
              const method = (...args) => {
                  const callback = command(...args)(props);
                  if (!tr.getMeta('preventDispatch') && !this.hasCustomState) {
                      view.dispatch(tr);
                  }
                  return callback;
              };
              return [name, method];
          }));
      }
      get chain() {
          return () => this.createChain();
      }
      get can() {
          return () => this.createCan();
      }
      createChain(startTr, shouldDispatch = true) {
          const { rawCommands, editor, state } = this;
          const { view } = editor;
          const callbacks = [];
          const hasStartTransaction = !!startTr;
          const tr = startTr || state.tr;
          const run = () => {
              if (!hasStartTransaction
                  && shouldDispatch
                  && !tr.getMeta('preventDispatch')
                  && !this.hasCustomState) {
                  view.dispatch(tr);
              }
              return callbacks.every(callback => callback === true);
          };
          const chain = {
              ...Object.fromEntries(Object.entries(rawCommands).map(([name, command]) => {
                  const chainedCommand = (...args) => {
                      const props = this.buildProps(tr, shouldDispatch);
                      const callback = command(...args)(props);
                      callbacks.push(callback);
                      return chain;
                  };
                  return [name, chainedCommand];
              })),
              run,
          };
          return chain;
      }
      createCan(startTr) {
          const { rawCommands, state } = this;
          const dispatch = false;
          const tr = startTr || state.tr;
          const props = this.buildProps(tr, dispatch);
          const formattedCommands = Object.fromEntries(Object.entries(rawCommands).map(([name, command]) => {
              return [name, (...args) => command(...args)({ ...props, dispatch: undefined })];
          }));
          return {
              ...formattedCommands,
              chain: () => this.createChain(tr, dispatch),
          };
      }
      buildProps(tr, shouldDispatch = true) {
          const { rawCommands, editor, state } = this;
          const { view } = editor;
          const props = {
              tr,
              editor,
              view,
              state: createChainableState({
                  state,
                  transaction: tr,
              }),
              dispatch: shouldDispatch ? () => undefined : undefined,
              chain: () => this.createChain(tr, shouldDispatch),
              can: () => this.createCan(tr),
              get commands() {
                  return Object.fromEntries(Object.entries(rawCommands).map(([name, command]) => {
                      return [name, (...args) => command(...args)(props)];
                  }));
              },
          };
          return props;
      }
  }

  class EventEmitter {
      constructor() {
          this.callbacks = {};
      }
      on(event, fn) {
          if (!this.callbacks[event]) {
              this.callbacks[event] = [];
          }
          this.callbacks[event].push(fn);
          return this;
      }
      emit(event, ...args) {
          const callbacks = this.callbacks[event];
          if (callbacks) {
              callbacks.forEach(callback => callback.apply(this, args));
          }
          return this;
      }
      off(event, fn) {
          const callbacks = this.callbacks[event];
          if (callbacks) {
              if (fn) {
                  this.callbacks[event] = callbacks.filter(callback => callback !== fn);
              }
              else {
                  delete this.callbacks[event];
              }
          }
          return this;
      }
      removeAllListeners() {
          this.callbacks = {};
      }
  }

  /**
   * Returns a field from an extension
   * @param extension The Tiptap extension
   * @param field The field, for example `renderHTML` or `priority`
   * @param context The context object that should be passed as `this` into the function
   * @returns The field value
   */
  function getExtensionField(extension, field, context) {
      if (extension.config[field] === undefined && extension.parent) {
          return getExtensionField(extension.parent, field, context);
      }
      if (typeof extension.config[field] === 'function') {
          const value = extension.config[field].bind({
              ...context,
              parent: extension.parent
                  ? getExtensionField(extension.parent, field, context)
                  : null,
          });
          return value;
      }
      return extension.config[field];
  }

  function splitExtensions(extensions) {
      const baseExtensions = extensions.filter(extension => extension.type === 'extension');
      const nodeExtensions = extensions.filter(extension => extension.type === 'node');
      const markExtensions = extensions.filter(extension => extension.type === 'mark');
      return {
          baseExtensions,
          nodeExtensions,
          markExtensions,
      };
  }

  /**
   * Get a list of all extension attributes defined in `addAttribute` and `addGlobalAttribute`.
   * @param extensions List of extensions
   */
  function getAttributesFromExtensions(extensions) {
      const extensionAttributes = [];
      const { nodeExtensions, markExtensions } = splitExtensions(extensions);
      const nodeAndMarkExtensions = [...nodeExtensions, ...markExtensions];
      const defaultAttribute = {
          default: null,
          rendered: true,
          renderHTML: null,
          parseHTML: null,
          keepOnSplit: true,
          isRequired: false,
      };
      extensions.forEach(extension => {
          const context = {
              name: extension.name,
              options: extension.options,
              storage: extension.storage,
          };
          const addGlobalAttributes = getExtensionField(extension, 'addGlobalAttributes', context);
          if (!addGlobalAttributes) {
              return;
          }
          // TODO: remove `as GlobalAttributes`
          const globalAttributes = addGlobalAttributes();
          globalAttributes.forEach(globalAttribute => {
              globalAttribute.types.forEach(type => {
                  Object
                      .entries(globalAttribute.attributes)
                      .forEach(([name, attribute]) => {
                      extensionAttributes.push({
                          type,
                          name,
                          attribute: {
                              ...defaultAttribute,
                              ...attribute,
                          },
                      });
                  });
              });
          });
      });
      nodeAndMarkExtensions.forEach(extension => {
          const context = {
              name: extension.name,
              options: extension.options,
              storage: extension.storage,
          };
          const addAttributes = getExtensionField(extension, 'addAttributes', context);
          if (!addAttributes) {
              return;
          }
          // TODO: remove `as Attributes`
          const attributes = addAttributes();
          Object
              .entries(attributes)
              .forEach(([name, attribute]) => {
              const mergedAttr = {
                  ...defaultAttribute,
                  ...attribute,
              };
              if (typeof (mergedAttr === null || mergedAttr === void 0 ? void 0 : mergedAttr.default) === 'function') {
                  mergedAttr.default = mergedAttr.default();
              }
              if ((mergedAttr === null || mergedAttr === void 0 ? void 0 : mergedAttr.isRequired) && (mergedAttr === null || mergedAttr === void 0 ? void 0 : mergedAttr.default) === undefined) {
                  delete mergedAttr.default;
              }
              extensionAttributes.push({
                  type: extension.name,
                  name,
                  attribute: mergedAttr,
              });
          });
      });
      return extensionAttributes;
  }

  function getNodeType(nameOrType, schema) {
      if (typeof nameOrType === 'string') {
          if (!schema.nodes[nameOrType]) {
              throw Error(`There is no node type named '${nameOrType}'. Maybe you forgot to add the extension?`);
          }
          return schema.nodes[nameOrType];
      }
      return nameOrType;
  }

  function mergeAttributes(...objects) {
      return objects
          .filter(item => !!item)
          .reduce((items, item) => {
          const mergedAttributes = { ...items };
          Object.entries(item).forEach(([key, value]) => {
              const exists = mergedAttributes[key];
              if (!exists) {
                  mergedAttributes[key] = value;
                  return;
              }
              if (key === 'class') {
                  const valueClasses = value ? value.split(' ') : [];
                  const existingClasses = mergedAttributes[key] ? mergedAttributes[key].split(' ') : [];
                  const insertClasses = valueClasses.filter(valueClass => !existingClasses.includes(valueClass));
                  mergedAttributes[key] = [...existingClasses, ...insertClasses].join(' ');
              }
              else if (key === 'style') {
                  mergedAttributes[key] = [mergedAttributes[key], value].join('; ');
              }
              else {
                  mergedAttributes[key] = value;
              }
          });
          return mergedAttributes;
      }, {});
  }

  function getRenderedAttributes(nodeOrMark, extensionAttributes) {
      return extensionAttributes
          .filter(item => item.attribute.rendered)
          .map(item => {
          if (!item.attribute.renderHTML) {
              return {
                  [item.name]: nodeOrMark.attrs[item.name],
              };
          }
          return item.attribute.renderHTML(nodeOrMark.attrs) || {};
      })
          .reduce((attributes, attribute) => mergeAttributes(attributes, attribute), {});
  }

  function isFunction(value) {
      return typeof value === 'function';
  }

  /**
   * Optionally calls `value` as a function.
   * Otherwise it is returned directly.
   * @param value Function or any value.
   * @param context Optional context to bind to function.
   * @param props Optional props to pass to function.
   */
  function callOrReturn(value, context = undefined, ...props) {
      if (isFunction(value)) {
          if (context) {
              return value.bind(context)(...props);
          }
          return value(...props);
      }
      return value;
  }

  function isEmptyObject(value = {}) {
      return Object.keys(value).length === 0 && value.constructor === Object;
  }

  function fromString(value) {
      if (typeof value !== 'string') {
          return value;
      }
      if (value.match(/^[+-]?(?:\d*\.)?\d+$/)) {
          return Number(value);
      }
      if (value === 'true') {
          return true;
      }
      if (value === 'false') {
          return false;
      }
      return value;
  }

  /**
   * This function merges extension attributes into parserule attributes (`attrs` or `getAttrs`).
   * Cancels when `getAttrs` returned `false`.
   * @param parseRule ProseMirror ParseRule
   * @param extensionAttributes List of attributes to inject
   */
  function injectExtensionAttributesToParseRule(parseRule, extensionAttributes) {
      if (parseRule.style) {
          return parseRule;
      }
      return {
          ...parseRule,
          getAttrs: node => {
              const oldAttributes = parseRule.getAttrs ? parseRule.getAttrs(node) : parseRule.attrs;
              if (oldAttributes === false) {
                  return false;
              }
              const newAttributes = extensionAttributes.reduce((items, item) => {
                  const value = item.attribute.parseHTML
                      ? item.attribute.parseHTML(node)
                      : fromString(node.getAttribute(item.name));
                  if (value === null || value === undefined) {
                      return items;
                  }
                  return {
                      ...items,
                      [item.name]: value,
                  };
              }, {});
              return { ...oldAttributes, ...newAttributes };
          },
      };
  }

  function cleanUpSchemaItem(data) {
      return Object.fromEntries(
      // @ts-ignore
      Object.entries(data).filter(([key, value]) => {
          if (key === 'attrs' && isEmptyObject(value)) {
              return false;
          }
          return value !== null && value !== undefined;
      }));
  }
  /**
   * Creates a new Prosemirror schema based on the given extensions.
   * @param extensions An array of Tiptap extensions
   * @param editor The editor instance
   * @returns A Prosemirror schema
   */
  function getSchemaByResolvedExtensions(extensions, editor) {
      var _a;
      const allAttributes = getAttributesFromExtensions(extensions);
      const { nodeExtensions, markExtensions } = splitExtensions(extensions);
      const topNode = (_a = nodeExtensions.find(extension => getExtensionField(extension, 'topNode'))) === null || _a === void 0 ? void 0 : _a.name;
      const nodes = Object.fromEntries(nodeExtensions.map(extension => {
          const extensionAttributes = allAttributes.filter(attribute => attribute.type === extension.name);
          const context = {
              name: extension.name,
              options: extension.options,
              storage: extension.storage,
              editor,
          };
          const extraNodeFields = extensions.reduce((fields, e) => {
              const extendNodeSchema = getExtensionField(e, 'extendNodeSchema', context);
              return {
                  ...fields,
                  ...(extendNodeSchema ? extendNodeSchema(extension) : {}),
              };
          }, {});
          const schema = cleanUpSchemaItem({
              ...extraNodeFields,
              content: callOrReturn(getExtensionField(extension, 'content', context)),
              marks: callOrReturn(getExtensionField(extension, 'marks', context)),
              group: callOrReturn(getExtensionField(extension, 'group', context)),
              inline: callOrReturn(getExtensionField(extension, 'inline', context)),
              atom: callOrReturn(getExtensionField(extension, 'atom', context)),
              selectable: callOrReturn(getExtensionField(extension, 'selectable', context)),
              draggable: callOrReturn(getExtensionField(extension, 'draggable', context)),
              code: callOrReturn(getExtensionField(extension, 'code', context)),
              defining: callOrReturn(getExtensionField(extension, 'defining', context)),
              isolating: callOrReturn(getExtensionField(extension, 'isolating', context)),
              attrs: Object.fromEntries(extensionAttributes.map(extensionAttribute => {
                  var _a;
                  return [extensionAttribute.name, { default: (_a = extensionAttribute === null || extensionAttribute === void 0 ? void 0 : extensionAttribute.attribute) === null || _a === void 0 ? void 0 : _a.default }];
              })),
          });
          const parseHTML = callOrReturn(getExtensionField(extension, 'parseHTML', context));
          if (parseHTML) {
              schema.parseDOM = parseHTML.map(parseRule => injectExtensionAttributesToParseRule(parseRule, extensionAttributes));
          }
          const renderHTML = getExtensionField(extension, 'renderHTML', context);
          if (renderHTML) {
              schema.toDOM = node => renderHTML({
                  node,
                  HTMLAttributes: getRenderedAttributes(node, extensionAttributes),
              });
          }
          const renderText = getExtensionField(extension, 'renderText', context);
          if (renderText) {
              schema.toText = renderText;
          }
          return [extension.name, schema];
      }));
      const marks = Object.fromEntries(markExtensions.map(extension => {
          const extensionAttributes = allAttributes.filter(attribute => attribute.type === extension.name);
          const context = {
              name: extension.name,
              options: extension.options,
              storage: extension.storage,
              editor,
          };
          const extraMarkFields = extensions.reduce((fields, e) => {
              const extendMarkSchema = getExtensionField(e, 'extendMarkSchema', context);
              return {
                  ...fields,
                  ...(extendMarkSchema ? extendMarkSchema(extension) : {}),
              };
          }, {});
          const schema = cleanUpSchemaItem({
              ...extraMarkFields,
              inclusive: callOrReturn(getExtensionField(extension, 'inclusive', context)),
              excludes: callOrReturn(getExtensionField(extension, 'excludes', context)),
              group: callOrReturn(getExtensionField(extension, 'group', context)),
              spanning: callOrReturn(getExtensionField(extension, 'spanning', context)),
              code: callOrReturn(getExtensionField(extension, 'code', context)),
              attrs: Object.fromEntries(extensionAttributes.map(extensionAttribute => {
                  var _a;
                  return [extensionAttribute.name, { default: (_a = extensionAttribute === null || extensionAttribute === void 0 ? void 0 : extensionAttribute.attribute) === null || _a === void 0 ? void 0 : _a.default }];
              })),
          });
          const parseHTML = callOrReturn(getExtensionField(extension, 'parseHTML', context));
          if (parseHTML) {
              schema.parseDOM = parseHTML.map(parseRule => injectExtensionAttributesToParseRule(parseRule, extensionAttributes));
          }
          const renderHTML = getExtensionField(extension, 'renderHTML', context);
          if (renderHTML) {
              schema.toDOM = mark => renderHTML({
                  mark,
                  HTMLAttributes: getRenderedAttributes(mark, extensionAttributes),
              });
          }
          return [extension.name, schema];
      }));
      return new model.Schema({
          topNode,
          nodes,
          marks,
      });
  }

  /**
   * Tries to get a node or mark type by its name.
   * @param name The name of the node or mark type
   * @param schema The Prosemiror schema to search in
   * @returns The node or mark type, or null if it doesn't exist
   */
  function getSchemaTypeByName(name, schema) {
      return schema.nodes[name] || schema.marks[name] || null;
  }

  function isExtensionRulesEnabled(extension, enabled) {
      if (Array.isArray(enabled)) {
          return enabled.some(enabledExtension => {
              const name = typeof enabledExtension === 'string'
                  ? enabledExtension
                  : enabledExtension.name;
              return name === extension.name;
          });
      }
      return enabled;
  }

  /**
   * Returns the text content of a resolved prosemirror position
   * @param $from The resolved position to get the text content from
   * @param maxMatch The maximum number of characters to match
   * @returns The text content
   */
  const getTextContentFromNodes = ($from, maxMatch = 500) => {
      let textBefore = '';
      const sliceEndPos = $from.parentOffset;
      $from.parent.nodesBetween(Math.max(0, sliceEndPos - maxMatch), sliceEndPos, (node, pos, parent, index) => {
          var _a, _b;
          const chunk = ((_b = (_a = node.type.spec).toText) === null || _b === void 0 ? void 0 : _b.call(_a, {
              node,
              pos,
              parent,
              index,
          }))
              || node.textContent
              || '%leaf%';
          textBefore += chunk.slice(0, Math.max(0, sliceEndPos - pos));
      });
      return textBefore;
  };

  function isRegExp(value) {
      return Object.prototype.toString.call(value) === '[object RegExp]';
  }

  class InputRule {
      constructor(config) {
          this.find = config.find;
          this.handler = config.handler;
      }
  }
  const inputRuleMatcherHandler = (text, find) => {
      if (isRegExp(find)) {
          return find.exec(text);
      }
      const inputRuleMatch = find(text);
      if (!inputRuleMatch) {
          return null;
      }
      const result = [inputRuleMatch.text];
      result.index = inputRuleMatch.index;
      result.input = text;
      result.data = inputRuleMatch.data;
      if (inputRuleMatch.replaceWith) {
          if (!inputRuleMatch.text.includes(inputRuleMatch.replaceWith)) {
              console.warn('[tiptap warn]: "inputRuleMatch.replaceWith" must be part of "inputRuleMatch.text".');
          }
          result.push(inputRuleMatch.replaceWith);
      }
      return result;
  };
  function run$1(config) {
      var _a;
      const { editor, from, to, text, rules, plugin, } = config;
      const { view } = editor;
      if (view.composing) {
          return false;
      }
      const $from = view.state.doc.resolve(from);
      if (
      // check for code node
      $from.parent.type.spec.code
          // check for code mark
          || !!((_a = ($from.nodeBefore || $from.nodeAfter)) === null || _a === void 0 ? void 0 : _a.marks.find(mark => mark.type.spec.code))) {
          return false;
      }
      let matched = false;
      const textBefore = getTextContentFromNodes($from) + text;
      rules.forEach(rule => {
          if (matched) {
              return;
          }
          const match = inputRuleMatcherHandler(textBefore, rule.find);
          if (!match) {
              return;
          }
          const tr = view.state.tr;
          const state = createChainableState({
              state: view.state,
              transaction: tr,
          });
          const range = {
              from: from - (match[0].length - text.length),
              to,
          };
          const { commands, chain, can } = new CommandManager({
              editor,
              state,
          });
          const handler = rule.handler({
              state,
              range,
              match,
              commands,
              chain,
              can,
          });
          // stop if there are no changes
          if (handler === null || !tr.steps.length) {
              return;
          }
          // store transform as meta data
          // so we can undo input rules within the `undoInputRules` command
          tr.setMeta(plugin, {
              transform: tr,
              from,
              to,
              text,
          });
          view.dispatch(tr);
          matched = true;
      });
      return matched;
  }
  /**
   * Create an input rules plugin. When enabled, it will cause text
   * input that matches any of the given rules to trigger the rule’s
   * action.
   */
  function inputRulesPlugin(props) {
      const { editor, rules } = props;
      const plugin = new state.Plugin({
          state: {
              init() {
                  return null;
              },
              apply(tr, prev) {
                  const stored = tr.getMeta(plugin);
                  if (stored) {
                      return stored;
                  }
                  // if InputRule is triggered by insertContent()
                  const simulatedInputMeta = tr.getMeta('applyInputRules');
                  const isSimulatedInput = !!simulatedInputMeta;
                  if (isSimulatedInput) {
                      setTimeout(() => {
                          const { from, text } = simulatedInputMeta;
                          const to = from + text.length;
                          run$1({
                              editor,
                              from,
                              to,
                              text,
                              rules,
                              plugin,
                          });
                      });
                  }
                  return tr.selectionSet || tr.docChanged ? null : prev;
              },
          },
          props: {
              handleTextInput(view, from, to, text) {
                  return run$1({
                      editor,
                      from,
                      to,
                      text,
                      rules,
                      plugin,
                  });
              },
              handleDOMEvents: {
                  compositionend: view => {
                      setTimeout(() => {
                          const { $cursor } = view.state.selection;
                          if ($cursor) {
                              run$1({
                                  editor,
                                  from: $cursor.pos,
                                  to: $cursor.pos,
                                  text: '',
                                  rules,
                                  plugin,
                              });
                          }
                      });
                      return false;
                  },
              },
              // add support for input rules to trigger on enter
              // this is useful for example for code blocks
              handleKeyDown(view, event) {
                  if (event.key !== 'Enter') {
                      return false;
                  }
                  const { $cursor } = view.state.selection;
                  if ($cursor) {
                      return run$1({
                          editor,
                          from: $cursor.pos,
                          to: $cursor.pos,
                          text: '\n',
                          rules,
                          plugin,
                      });
                  }
                  return false;
              },
          },
          // @ts-ignore
          isInputRules: true,
      });
      return plugin;
  }

  function isNumber(value) {
      return typeof value === 'number';
  }

  /**
   * Paste rules are used to react to pasted content.
   * @see https://tiptap.dev/guide/custom-extensions/#paste-rules
   */
  class PasteRule {
      constructor(config) {
          this.find = config.find;
          this.handler = config.handler;
      }
  }
  const pasteRuleMatcherHandler = (text, find, event) => {
      if (isRegExp(find)) {
          return [...text.matchAll(find)];
      }
      const matches = find(text, event);
      if (!matches) {
          return [];
      }
      return matches.map(pasteRuleMatch => {
          const result = [pasteRuleMatch.text];
          result.index = pasteRuleMatch.index;
          result.input = text;
          result.data = pasteRuleMatch.data;
          if (pasteRuleMatch.replaceWith) {
              if (!pasteRuleMatch.text.includes(pasteRuleMatch.replaceWith)) {
                  console.warn('[tiptap warn]: "pasteRuleMatch.replaceWith" must be part of "pasteRuleMatch.text".');
              }
              result.push(pasteRuleMatch.replaceWith);
          }
          return result;
      });
  };
  function run(config) {
      const { editor, state, from, to, rule, pasteEvent, dropEvent, } = config;
      const { commands, chain, can } = new CommandManager({
          editor,
          state,
      });
      const handlers = [];
      state.doc.nodesBetween(from, to, (node, pos) => {
          if (!node.isTextblock || node.type.spec.code) {
              return;
          }
          const resolvedFrom = Math.max(from, pos);
          const resolvedTo = Math.min(to, pos + node.content.size);
          const textToMatch = node.textBetween(resolvedFrom - pos, resolvedTo - pos, undefined, '\ufffc');
          const matches = pasteRuleMatcherHandler(textToMatch, rule.find, pasteEvent);
          matches.forEach(match => {
              if (match.index === undefined) {
                  return;
              }
              const start = resolvedFrom + match.index + 1;
              const end = start + match[0].length;
              const range = {
                  from: state.tr.mapping.map(start),
                  to: state.tr.mapping.map(end),
              };
              const handler = rule.handler({
                  state,
                  range,
                  match,
                  commands,
                  chain,
                  can,
                  pasteEvent,
                  dropEvent,
              });
              handlers.push(handler);
          });
      });
      const success = handlers.every(handler => handler !== null);
      return success;
  }
  const createClipboardPasteEvent = (text) => {
      var _a;
      const event = new ClipboardEvent('paste', {
          clipboardData: new DataTransfer(),
      });
      (_a = event.clipboardData) === null || _a === void 0 ? void 0 : _a.setData('text/html', text);
      return event;
  };
  /**
   * Create an paste rules plugin. When enabled, it will cause pasted
   * text that matches any of the given rules to trigger the rule’s
   * action.
   */
  function pasteRulesPlugin(props) {
      const { editor, rules } = props;
      let dragSourceElement = null;
      let isPastedFromProseMirror = false;
      let isDroppedFromProseMirror = false;
      let pasteEvent = typeof ClipboardEvent !== 'undefined' ? new ClipboardEvent('paste') : null;
      let dropEvent = typeof DragEvent !== 'undefined' ? new DragEvent('drop') : null;
      const processEvent = ({ state, from, to, rule, pasteEvt, }) => {
          const tr = state.tr;
          const chainableState = createChainableState({
              state,
              transaction: tr,
          });
          const handler = run({
              editor,
              state: chainableState,
              from: Math.max(from - 1, 0),
              to: to.b - 1,
              rule,
              pasteEvent: pasteEvt,
              dropEvent,
          });
          if (!handler || !tr.steps.length) {
              return;
          }
          dropEvent = typeof DragEvent !== 'undefined' ? new DragEvent('drop') : null;
          pasteEvent = typeof ClipboardEvent !== 'undefined' ? new ClipboardEvent('paste') : null;
          return tr;
      };
      const plugins = rules.map(rule => {
          return new state.Plugin({
              // we register a global drag handler to track the current drag source element
              view(view) {
                  const handleDragstart = (event) => {
                      var _a;
                      dragSourceElement = ((_a = view.dom.parentElement) === null || _a === void 0 ? void 0 : _a.contains(event.target))
                          ? view.dom.parentElement
                          : null;
                  };
                  window.addEventListener('dragstart', handleDragstart);
                  return {
                      destroy() {
                          window.removeEventListener('dragstart', handleDragstart);
                      },
                  };
              },
              props: {
                  handleDOMEvents: {
                      drop: (view, event) => {
                          isDroppedFromProseMirror = dragSourceElement === view.dom.parentElement;
                          dropEvent = event;
                          return false;
                      },
                      paste: (_view, event) => {
                          var _a;
                          const html = (_a = event.clipboardData) === null || _a === void 0 ? void 0 : _a.getData('text/html');
                          pasteEvent = event;
                          isPastedFromProseMirror = !!(html === null || html === void 0 ? void 0 : html.includes('data-pm-slice'));
                          return false;
                      },
                  },
              },
              appendTransaction: (transactions, oldState, state) => {
                  const transaction = transactions[0];
                  const isPaste = transaction.getMeta('uiEvent') === 'paste' && !isPastedFromProseMirror;
                  const isDrop = transaction.getMeta('uiEvent') === 'drop' && !isDroppedFromProseMirror;
                  // if PasteRule is triggered by insertContent()
                  const simulatedPasteMeta = transaction.getMeta('applyPasteRules');
                  const isSimulatedPaste = !!simulatedPasteMeta;
                  if (!isPaste && !isDrop && !isSimulatedPaste) {
                      return;
                  }
                  // Handle simulated paste
                  if (isSimulatedPaste) {
                      const { from, text } = simulatedPasteMeta;
                      const to = from + text.length;
                      const pasteEvt = createClipboardPasteEvent(text);
                      return processEvent({
                          rule,
                          state,
                          from,
                          to: { b: to },
                          pasteEvt,
                      });
                  }
                  // handle actual paste/drop
                  const from = oldState.doc.content.findDiffStart(state.doc.content);
                  const to = oldState.doc.content.findDiffEnd(state.doc.content);
                  // stop if there is no changed range
                  if (!isNumber(from) || !to || from === to.b) {
                      return;
                  }
                  return processEvent({
                      rule,
                      state,
                      from,
                      to,
                      pasteEvt: pasteEvent,
                  });
              },
          });
      });
      return plugins;
  }

  function findDuplicates(items) {
      const filtered = items.filter((el, index) => items.indexOf(el) !== index);
      return [...new Set(filtered)];
  }

  class ExtensionManager {
      constructor(extensions, editor) {
          this.splittableMarks = [];
          this.editor = editor;
          this.extensions = ExtensionManager.resolve(extensions);
          this.schema = getSchemaByResolvedExtensions(this.extensions, editor);
          this.setupExtensions();
      }
      /**
       * Returns a flattened and sorted extension list while
       * also checking for duplicated extensions and warns the user.
       * @param extensions An array of Tiptap extensions
       * @returns An flattened and sorted array of Tiptap extensions
       */
      static resolve(extensions) {
          const resolvedExtensions = ExtensionManager.sort(ExtensionManager.flatten(extensions));
          const duplicatedNames = findDuplicates(resolvedExtensions.map(extension => extension.name));
          if (duplicatedNames.length) {
              console.warn(`[tiptap warn]: Duplicate extension names found: [${duplicatedNames
                .map(item => `'${item}'`)
                .join(', ')}]. This can lead to issues.`);
          }
          return resolvedExtensions;
      }
      /**
       * Create a flattened array of extensions by traversing the `addExtensions` field.
       * @param extensions An array of Tiptap extensions
       * @returns A flattened array of Tiptap extensions
       */
      static flatten(extensions) {
          return (extensions
              .map(extension => {
              const context = {
                  name: extension.name,
                  options: extension.options,
                  storage: extension.storage,
              };
              const addExtensions = getExtensionField(extension, 'addExtensions', context);
              if (addExtensions) {
                  return [extension, ...this.flatten(addExtensions())];
              }
              return extension;
          })
              // `Infinity` will break TypeScript so we set a number that is probably high enough
              .flat(10));
      }
      /**
       * Sort extensions by priority.
       * @param extensions An array of Tiptap extensions
       * @returns A sorted array of Tiptap extensions by priority
       */
      static sort(extensions) {
          const defaultPriority = 100;
          return extensions.sort((a, b) => {
              const priorityA = getExtensionField(a, 'priority') || defaultPriority;
              const priorityB = getExtensionField(b, 'priority') || defaultPriority;
              if (priorityA > priorityB) {
                  return -1;
              }
              if (priorityA < priorityB) {
                  return 1;
              }
              return 0;
          });
      }
      /**
       * Get all commands from the extensions.
       * @returns An object with all commands where the key is the command name and the value is the command function
       */
      get commands() {
          return this.extensions.reduce((commands, extension) => {
              const context = {
                  name: extension.name,
                  options: extension.options,
                  storage: extension.storage,
                  editor: this.editor,
                  type: getSchemaTypeByName(extension.name, this.schema),
              };
              const addCommands = getExtensionField(extension, 'addCommands', context);
              if (!addCommands) {
                  return commands;
              }
              return {
                  ...commands,
                  ...addCommands(),
              };
          }, {});
      }
      /**
       * Get all registered Prosemirror plugins from the extensions.
       * @returns An array of Prosemirror plugins
       */
      get plugins() {
          const { editor } = this;
          // With ProseMirror, first plugins within an array are executed first.
          // In Tiptap, we provide the ability to override plugins,
          // so it feels more natural to run plugins at the end of an array first.
          // That’s why we have to reverse the `extensions` array and sort again
          // based on the `priority` option.
          const extensions = ExtensionManager.sort([...this.extensions].reverse());
          const inputRules = [];
          const pasteRules = [];
          const allPlugins = extensions
              .map(extension => {
              const context = {
                  name: extension.name,
                  options: extension.options,
                  storage: extension.storage,
                  editor,
                  type: getSchemaTypeByName(extension.name, this.schema),
              };
              const plugins = [];
              const addKeyboardShortcuts = getExtensionField(extension, 'addKeyboardShortcuts', context);
              let defaultBindings = {};
              // bind exit handling
              if (extension.type === 'mark' && extension.config.exitable) {
                  defaultBindings.ArrowRight = () => Mark.handleExit({ editor, mark: extension });
              }
              if (addKeyboardShortcuts) {
                  const bindings = Object.fromEntries(Object.entries(addKeyboardShortcuts()).map(([shortcut, method]) => {
                      return [shortcut, () => method({ editor })];
                  }));
                  defaultBindings = { ...defaultBindings, ...bindings };
              }
              const keyMapPlugin = keymap.keymap(defaultBindings);
              plugins.push(keyMapPlugin);
              const addInputRules = getExtensionField(extension, 'addInputRules', context);
              if (isExtensionRulesEnabled(extension, editor.options.enableInputRules) && addInputRules) {
                  inputRules.push(...addInputRules());
              }
              const addPasteRules = getExtensionField(extension, 'addPasteRules', context);
              if (isExtensionRulesEnabled(extension, editor.options.enablePasteRules) && addPasteRules) {
                  pasteRules.push(...addPasteRules());
              }
              const addProseMirrorPlugins = getExtensionField(extension, 'addProseMirrorPlugins', context);
              if (addProseMirrorPlugins) {
                  const proseMirrorPlugins = addProseMirrorPlugins();
                  plugins.push(...proseMirrorPlugins);
              }
              return plugins;
          })
              .flat();
          return [
              inputRulesPlugin({
                  editor,
                  rules: inputRules,
              }),
              ...pasteRulesPlugin({
                  editor,
                  rules: pasteRules,
              }),
              ...allPlugins,
          ];
      }
      /**
       * Get all attributes from the extensions.
       * @returns An array of attributes
       */
      get attributes() {
          return getAttributesFromExtensions(this.extensions);
      }
      /**
       * Get all node views from the extensions.
       * @returns An object with all node views where the key is the node name and the value is the node view function
       */
      get nodeViews() {
          const { editor } = this;
          const { nodeExtensions } = splitExtensions(this.extensions);
          return Object.fromEntries(nodeExtensions
              .filter(extension => !!getExtensionField(extension, 'addNodeView'))
              .map(extension => {
              const extensionAttributes = this.attributes.filter(attribute => attribute.type === extension.name);
              const context = {
                  name: extension.name,
                  options: extension.options,
                  storage: extension.storage,
                  editor,
                  type: getNodeType(extension.name, this.schema),
              };
              const addNodeView = getExtensionField(extension, 'addNodeView', context);
              if (!addNodeView) {
                  return [];
              }
              const nodeview = (node, view, getPos, decorations) => {
                  const HTMLAttributes = getRenderedAttributes(node, extensionAttributes);
                  return addNodeView()({
                      editor,
                      node,
                      getPos,
                      decorations,
                      HTMLAttributes,
                      extension,
                  });
              };
              return [extension.name, nodeview];
          }));
      }
      /**
       * Go through all extensions, create extension storages & setup marks
       * & bind editor event listener.
       */
      setupExtensions() {
          this.extensions.forEach(extension => {
              var _a;
              // store extension storage in editor
              this.editor.extensionStorage[extension.name] = extension.storage;
              const context = {
                  name: extension.name,
                  options: extension.options,
                  storage: extension.storage,
                  editor: this.editor,
                  type: getSchemaTypeByName(extension.name, this.schema),
              };
              if (extension.type === 'mark') {
                  const keepOnSplit = (_a = callOrReturn(getExtensionField(extension, 'keepOnSplit', context))) !== null && _a !== void 0 ? _a : true;
                  if (keepOnSplit) {
                      this.splittableMarks.push(extension.name);
                  }
              }
              const onBeforeCreate = getExtensionField(extension, 'onBeforeCreate', context);
              const onCreate = getExtensionField(extension, 'onCreate', context);
              const onUpdate = getExtensionField(extension, 'onUpdate', context);
              const onSelectionUpdate = getExtensionField(extension, 'onSelectionUpdate', context);
              const onTransaction = getExtensionField(extension, 'onTransaction', context);
              const onFocus = getExtensionField(extension, 'onFocus', context);
              const onBlur = getExtensionField(extension, 'onBlur', context);
              const onDestroy = getExtensionField(extension, 'onDestroy', context);
              if (onBeforeCreate) {
                  this.editor.on('beforeCreate', onBeforeCreate);
              }
              if (onCreate) {
                  this.editor.on('create', onCreate);
              }
              if (onUpdate) {
                  this.editor.on('update', onUpdate);
              }
              if (onSelectionUpdate) {
                  this.editor.on('selectionUpdate', onSelectionUpdate);
              }
              if (onTransaction) {
                  this.editor.on('transaction', onTransaction);
              }
              if (onFocus) {
                  this.editor.on('focus', onFocus);
              }
              if (onBlur) {
                  this.editor.on('blur', onBlur);
              }
              if (onDestroy) {
                  this.editor.on('destroy', onDestroy);
              }
          });
      }
  }

  // see: https://github.com/mesqueeb/is-what/blob/88d6e4ca92fb2baab6003c54e02eedf4e729e5ab/src/index.ts
  function getType(value) {
      return Object.prototype.toString.call(value).slice(8, -1);
  }
  function isPlainObject(value) {
      if (getType(value) !== 'Object') {
          return false;
      }
      return value.constructor === Object && Object.getPrototypeOf(value) === Object.prototype;
  }

  function mergeDeep(target, source) {
      const output = { ...target };
      if (isPlainObject(target) && isPlainObject(source)) {
          Object.keys(source).forEach(key => {
              if (isPlainObject(source[key])) {
                  if (!(key in target)) {
                      Object.assign(output, { [key]: source[key] });
                  }
                  else {
                      output[key] = mergeDeep(target[key], source[key]);
                  }
              }
              else {
                  Object.assign(output, { [key]: source[key] });
              }
          });
      }
      return output;
  }

  /**
   * The Extension class is the base class for all extensions.
   * @see https://tiptap.dev/api/extensions#create-a-new-extension
   */
  class Extension {
      constructor(config = {}) {
          this.type = 'extension';
          this.name = 'extension';
          this.parent = null;
          this.child = null;
          this.config = {
              name: this.name,
              defaultOptions: {},
          };
          this.config = {
              ...this.config,
              ...config,
          };
          this.name = this.config.name;
          if (config.defaultOptions && Object.keys(config.defaultOptions).length > 0) {
              console.warn(`[tiptap warn]: BREAKING CHANGE: "defaultOptions" is deprecated. Please use "addOptions" instead. Found in extension: "${this.name}".`);
          }
          // TODO: remove `addOptions` fallback
          this.options = this.config.defaultOptions;
          if (this.config.addOptions) {
              this.options = callOrReturn(getExtensionField(this, 'addOptions', {
                  name: this.name,
              }));
          }
          this.storage = callOrReturn(getExtensionField(this, 'addStorage', {
              name: this.name,
              options: this.options,
          })) || {};
      }
      static create(config = {}) {
          return new Extension(config);
      }
      configure(options = {}) {
          // return a new instance so we can use the same extension
          // with different calls of `configure`
          const extension = this.extend();
          extension.parent = this.parent;
          extension.options = mergeDeep(this.options, options);
          extension.storage = callOrReturn(getExtensionField(extension, 'addStorage', {
              name: extension.name,
              options: extension.options,
          }));
          return extension;
      }
      extend(extendedConfig = {}) {
          const extension = new Extension({ ...this.config, ...extendedConfig });
          extension.parent = this;
          this.child = extension;
          extension.name = extendedConfig.name ? extendedConfig.name : extension.parent.name;
          if (extendedConfig.defaultOptions) {
              console.warn(`[tiptap warn]: BREAKING CHANGE: "defaultOptions" is deprecated. Please use "addOptions" instead. Found in extension: "${extension.name}".`);
          }
          extension.options = callOrReturn(getExtensionField(extension, 'addOptions', {
              name: extension.name,
          }));
          extension.storage = callOrReturn(getExtensionField(extension, 'addStorage', {
              name: extension.name,
              options: extension.options,
          }));
          return extension;
      }
  }

  /**
   * Gets the text between two positions in a Prosemirror node
   * and serializes it using the given text serializers and block separator (see getText)
   * @param startNode The Prosemirror node to start from
   * @param range The range of the text to get
   * @param options Options for the text serializer & block separator
   * @returns The text between the two positions
   */
  function getTextBetween(startNode, range, options) {
      const { from, to } = range;
      const { blockSeparator = '\n\n', textSerializers = {} } = options || {};
      let text = '';
      startNode.nodesBetween(from, to, (node, pos, parent, index) => {
          var _a;
          if (node.isBlock && pos > from) {
              text += blockSeparator;
          }
          const textSerializer = textSerializers === null || textSerializers === void 0 ? void 0 : textSerializers[node.type.name];
          if (textSerializer) {
              if (parent) {
                  text += textSerializer({
                      node,
                      pos,
                      parent,
                      index,
                      range,
                  });
              }
              // do not descend into child nodes when there exists a serializer
              return false;
          }
          if (node.isText) {
              text += (_a = node === null || node === void 0 ? void 0 : node.text) === null || _a === void 0 ? void 0 : _a.slice(Math.max(from, pos) - pos, to - pos); // eslint-disable-line
          }
      });
      return text;
  }

  /**
   * Find text serializers `toText` in a Prosemirror schema
   * @param schema The Prosemirror schema to search in
   * @returns A record of text serializers by node name
   */
  function getTextSerializersFromSchema(schema) {
      return Object.fromEntries(Object.entries(schema.nodes)
          .filter(([, node]) => node.spec.toText)
          .map(([name, node]) => [name, node.spec.toText]));
  }

  const ClipboardTextSerializer = Extension.create({
      name: 'clipboardTextSerializer',
      addOptions() {
          return {
              blockSeparator: undefined,
          };
      },
      addProseMirrorPlugins() {
          return [
              new state.Plugin({
                  key: new state.PluginKey('clipboardTextSerializer'),
                  props: {
                      clipboardTextSerializer: () => {
                          const { editor } = this;
                          const { state, schema } = editor;
                          const { doc, selection } = state;
                          const { ranges } = selection;
                          const from = Math.min(...ranges.map(range => range.$from.pos));
                          const to = Math.max(...ranges.map(range => range.$to.pos));
                          const textSerializers = getTextSerializersFromSchema(schema);
                          const range = { from, to };
                          return getTextBetween(doc, range, {
                              ...(this.options.blockSeparator !== undefined
                                  ? { blockSeparator: this.options.blockSeparator }
                                  : {}),
                              textSerializers,
                          });
                      },
                  },
              }),
          ];
      },
  });

  const blur = () => ({ editor, view }) => {
      requestAnimationFrame(() => {
          var _a;
          if (!editor.isDestroyed) {
              view.dom.blur();
              // Browsers should remove the caret on blur but safari does not.
              // See: https://github.com/ueberdosis/tiptap/issues/2405
              (_a = window === null || window === void 0 ? void 0 : window.getSelection()) === null || _a === void 0 ? void 0 : _a.removeAllRanges();
          }
      });
      return true;
  };

  const clearContent = (emitUpdate = false) => ({ commands }) => {
      return commands.setContent('', emitUpdate);
  };

  const clearNodes = () => ({ state, tr, dispatch }) => {
      const { selection } = tr;
      const { ranges } = selection;
      if (!dispatch) {
          return true;
      }
      ranges.forEach(({ $from, $to }) => {
          state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
              if (node.type.isText) {
                  return;
              }
              const { doc, mapping } = tr;
              const $mappedFrom = doc.resolve(mapping.map(pos));
              const $mappedTo = doc.resolve(mapping.map(pos + node.nodeSize));
              const nodeRange = $mappedFrom.blockRange($mappedTo);
              if (!nodeRange) {
                  return;
              }
              const targetLiftDepth = transform.liftTarget(nodeRange);
              if (node.type.isTextblock) {
                  const { defaultType } = $mappedFrom.parent.contentMatchAt($mappedFrom.index());
                  tr.setNodeMarkup(nodeRange.start, defaultType);
              }
              if (targetLiftDepth || targetLiftDepth === 0) {
                  tr.lift(nodeRange, targetLiftDepth);
              }
          });
      });
      return true;
  };

  const command = fn => props => {
      return fn(props);
  };

  const createParagraphNear = () => ({ state, dispatch }) => {
      return commands$1.createParagraphNear(state, dispatch);
  };

  const cut = (originRange, targetPos) => ({ editor, tr }) => {
      const { state: state$1 } = editor;
      const contentSlice = state$1.doc.slice(originRange.from, originRange.to);
      tr.deleteRange(originRange.from, originRange.to);
      const newPos = tr.mapping.map(targetPos);
      tr.insert(newPos, contentSlice.content);
      tr.setSelection(new state.TextSelection(tr.doc.resolve(newPos - 1)));
      return true;
  };

  const deleteCurrentNode = () => ({ tr, dispatch }) => {
      const { selection } = tr;
      const currentNode = selection.$anchor.node();
      // if there is content inside the current node, break out of this command
      if (currentNode.content.size > 0) {
          return false;
      }
      const $pos = tr.selection.$anchor;
      for (let depth = $pos.depth; depth > 0; depth -= 1) {
          const node = $pos.node(depth);
          if (node.type === currentNode.type) {
              if (dispatch) {
                  const from = $pos.before(depth);
                  const to = $pos.after(depth);
                  tr.delete(from, to).scrollIntoView();
              }
              return true;
          }
      }
      return false;
  };

  const deleteNode = typeOrName => ({ tr, state, dispatch }) => {
      const type = getNodeType(typeOrName, state.schema);
      const $pos = tr.selection.$anchor;
      for (let depth = $pos.depth; depth > 0; depth -= 1) {
          const node = $pos.node(depth);
          if (node.type === type) {
              if (dispatch) {
                  const from = $pos.before(depth);
                  const to = $pos.after(depth);
                  tr.delete(from, to).scrollIntoView();
              }
              return true;
          }
      }
      return false;
  };

  const deleteRange = range => ({ tr, dispatch }) => {
      const { from, to } = range;
      if (dispatch) {
          tr.delete(from, to);
      }
      return true;
  };

  const deleteSelection = () => ({ state, dispatch }) => {
      return commands$1.deleteSelection(state, dispatch);
  };

  const enter = () => ({ commands }) => {
      return commands.keyboardShortcut('Enter');
  };

  const exitCode = () => ({ state, dispatch }) => {
      return commands$1.exitCode(state, dispatch);
  };

  /**
   * Check if object1 includes object2
   * @param object1 Object
   * @param object2 Object
   */
  function objectIncludes(object1, object2, options = { strict: true }) {
      const keys = Object.keys(object2);
      if (!keys.length) {
          return true;
      }
      return keys.every(key => {
          if (options.strict) {
              return object2[key] === object1[key];
          }
          if (isRegExp(object2[key])) {
              return object2[key].test(object1[key]);
          }
          return object2[key] === object1[key];
      });
  }

  function findMarkInSet(marks, type, attributes = {}) {
      return marks.find(item => {
          return item.type === type && objectIncludes(item.attrs, attributes);
      });
  }
  function isMarkInSet(marks, type, attributes = {}) {
      return !!findMarkInSet(marks, type, attributes);
  }
  function getMarkRange($pos, type, attributes = {}) {
      if (!$pos || !type) {
          return;
      }
      let start = $pos.parent.childAfter($pos.parentOffset);
      if ($pos.parentOffset === start.offset && start.offset !== 0) {
          start = $pos.parent.childBefore($pos.parentOffset);
      }
      if (!start.node) {
          return;
      }
      const mark = findMarkInSet([...start.node.marks], type, attributes);
      if (!mark) {
          return;
      }
      let startIndex = start.index;
      let startPos = $pos.start() + start.offset;
      let endIndex = startIndex + 1;
      let endPos = startPos + start.node.nodeSize;
      findMarkInSet([...start.node.marks], type, attributes);
      while (startIndex > 0 && mark.isInSet($pos.parent.child(startIndex - 1).marks)) {
          startIndex -= 1;
          startPos -= $pos.parent.child(startIndex).nodeSize;
      }
      while (endIndex < $pos.parent.childCount
          && isMarkInSet([...$pos.parent.child(endIndex).marks], type, attributes)) {
          endPos += $pos.parent.child(endIndex).nodeSize;
          endIndex += 1;
      }
      return {
          from: startPos,
          to: endPos,
      };
  }

  function getMarkType(nameOrType, schema) {
      if (typeof nameOrType === 'string') {
          if (!schema.marks[nameOrType]) {
              throw Error(`There is no mark type named '${nameOrType}'. Maybe you forgot to add the extension?`);
          }
          return schema.marks[nameOrType];
      }
      return nameOrType;
  }

  const extendMarkRange = (typeOrName, attributes = {}) => ({ tr, state: state$1, dispatch }) => {
      const type = getMarkType(typeOrName, state$1.schema);
      const { doc, selection } = tr;
      const { $from, from, to } = selection;
      if (dispatch) {
          const range = getMarkRange($from, type, attributes);
          if (range && range.from <= from && range.to >= to) {
              const newSelection = state.TextSelection.create(doc, range.from, range.to);
              tr.setSelection(newSelection);
          }
      }
      return true;
  };

  const first = commands => props => {
      const items = typeof commands === 'function'
          ? commands(props)
          : commands;
      for (let i = 0; i < items.length; i += 1) {
          if (items[i](props)) {
              return true;
          }
      }
      return false;
  };

  function isTextSelection(value) {
      return value instanceof state.TextSelection;
  }

  function minMax(value = 0, min = 0, max = 0) {
      return Math.min(Math.max(value, min), max);
  }

  function resolveFocusPosition(doc, position = null) {
      if (!position) {
          return null;
      }
      const selectionAtStart = state.Selection.atStart(doc);
      const selectionAtEnd = state.Selection.atEnd(doc);
      if (position === 'start' || position === true) {
          return selectionAtStart;
      }
      if (position === 'end') {
          return selectionAtEnd;
      }
      const minPos = selectionAtStart.from;
      const maxPos = selectionAtEnd.to;
      if (position === 'all') {
          return state.TextSelection.create(doc, minMax(0, minPos, maxPos), minMax(doc.content.size, minPos, maxPos));
      }
      return state.TextSelection.create(doc, minMax(position, minPos, maxPos), minMax(position, minPos, maxPos));
  }

  function isiOS() {
      return [
          'iPad Simulator',
          'iPhone Simulator',
          'iPod Simulator',
          'iPad',
          'iPhone',
          'iPod',
      ].includes(navigator.platform)
          // iPad on iOS 13 detection
          || (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
  }

  const focus = (position = null, options = {}) => ({ editor, view, tr, dispatch, }) => {
      options = {
          scrollIntoView: true,
          ...options,
      };
      const delayedFocus = () => {
          // focus within `requestAnimationFrame` breaks focus on iOS
          // so we have to call this
          if (isiOS()) {
              view.dom.focus();
          }
          // For React we have to focus asynchronously. Otherwise wild things happen.
          // see: https://github.com/ueberdosis/tiptap/issues/1520
          requestAnimationFrame(() => {
              if (!editor.isDestroyed) {
                  view.focus();
                  if (options === null || options === void 0 ? void 0 : options.scrollIntoView) {
                      editor.commands.scrollIntoView();
                  }
              }
          });
      };
      if ((view.hasFocus() && position === null) || position === false) {
          return true;
      }
      // we don’t try to resolve a NodeSelection or CellSelection
      if (dispatch && position === null && !isTextSelection(editor.state.selection)) {
          delayedFocus();
          return true;
      }
      // pass through tr.doc instead of editor.state.doc
      // since transactions could change the editors state before this command has been run
      const selection = resolveFocusPosition(tr.doc, position) || editor.state.selection;
      const isSameSelection = editor.state.selection.eq(selection);
      if (dispatch) {
          if (!isSameSelection) {
              tr.setSelection(selection);
          }
          // `tr.setSelection` resets the stored marks
          // so we’ll restore them if the selection is the same as before
          if (isSameSelection && tr.storedMarks) {
              tr.setStoredMarks(tr.storedMarks);
          }
          delayedFocus();
      }
      return true;
  };

  const forEach = (items, fn) => props => {
      return items.every((item, index) => fn(item, { ...props, index }));
  };

  const insertContent = (value, options) => ({ tr, commands }) => {
      return commands.insertContentAt({ from: tr.selection.from, to: tr.selection.to }, value, options);
  };

  const removeWhitespaces = (node) => {
      const children = node.childNodes;
      for (let i = children.length - 1; i >= 0; i -= 1) {
          const child = children[i];
          if (child.nodeType === 3 && child.nodeValue && /^(\n\s\s|\n)$/.test(child.nodeValue)) {
              node.removeChild(child);
          }
          else if (child.nodeType === 1) {
              removeWhitespaces(child);
          }
      }
      return node;
  };
  function elementFromString(value) {
      // add a wrapper to preserve leading and trailing whitespace
      const wrappedValue = `<body>${value}</body>`;
      const html = new window.DOMParser().parseFromString(wrappedValue, 'text/html').body;
      return removeWhitespaces(html);
  }

  /**
   * Takes a JSON or HTML content and creates a Prosemirror node or fragment from it.
   * @param content The JSON or HTML content to create the node from
   * @param schema The Prosemirror schema to use for the node
   * @param options Options for the parser
   * @returns The created Prosemirror node or fragment
   */
  function createNodeFromContent(content, schema, options) {
      options = {
          slice: true,
          parseOptions: {},
          ...options,
      };
      const isJSONContent = typeof content === 'object' && content !== null;
      const isTextContent = typeof content === 'string';
      if (isJSONContent) {
          try {
              const isArrayContent = Array.isArray(content) && content.length > 0;
              // if the JSON Content is an array of nodes, create a fragment for each node
              if (isArrayContent) {
                  return model.Fragment.fromArray(content.map(item => schema.nodeFromJSON(item)));
              }
              return schema.nodeFromJSON(content);
          }
          catch (error) {
              console.warn('[tiptap warn]: Invalid content.', 'Passed value:', content, 'Error:', error);
              return createNodeFromContent('', schema, options);
          }
      }
      if (isTextContent) {
          const parser = model.DOMParser.fromSchema(schema);
          return options.slice
              ? parser.parseSlice(elementFromString(content), options.parseOptions).content
              : parser.parse(elementFromString(content), options.parseOptions);
      }
      return createNodeFromContent('', schema, options);
  }

  // source: https://github.com/ProseMirror/prosemirror-state/blob/master/src/selection.js#L466
  function selectionToInsertionEnd(tr, startLen, bias) {
      const last = tr.steps.length - 1;
      if (last < startLen) {
          return;
      }
      const step = tr.steps[last];
      if (!(step instanceof transform.ReplaceStep || step instanceof transform.ReplaceAroundStep)) {
          return;
      }
      const map = tr.mapping.maps[last];
      let end = 0;
      map.forEach((_from, _to, _newFrom, newTo) => {
          if (end === 0) {
              end = newTo;
          }
      });
      tr.setSelection(state.Selection.near(tr.doc.resolve(end), bias));
  }

  const isFragment = (nodeOrFragment) => {
      return nodeOrFragment.toString().startsWith('<');
  };
  const insertContentAt = (position, value, options) => ({ tr, dispatch, editor }) => {
      if (dispatch) {
          options = {
              parseOptions: {},
              updateSelection: true,
              applyInputRules: false,
              applyPasteRules: false,
              ...options,
          };
          const content = createNodeFromContent(value, editor.schema, {
              parseOptions: {
                  preserveWhitespace: 'full',
                  ...options.parseOptions,
              },
          });
          // don’t dispatch an empty fragment because this can lead to strange errors
          if (content.toString() === '<>') {
              return true;
          }
          let { from, to } = typeof position === 'number' ? { from: position, to: position } : { from: position.from, to: position.to };
          let isOnlyTextContent = true;
          let isOnlyBlockContent = true;
          const nodes = isFragment(content) ? content : [content];
          nodes.forEach(node => {
              // check if added node is valid
              node.check();
              isOnlyTextContent = isOnlyTextContent ? node.isText && node.marks.length === 0 : false;
              isOnlyBlockContent = isOnlyBlockContent ? node.isBlock : false;
          });
          // check if we can replace the wrapping node by
          // the newly inserted content
          // example:
          // replace an empty paragraph by an inserted image
          // instead of inserting the image below the paragraph
          if (from === to && isOnlyBlockContent) {
              const { parent } = tr.doc.resolve(from);
              const isEmptyTextBlock = parent.isTextblock && !parent.type.spec.code && !parent.childCount;
              if (isEmptyTextBlock) {
                  from -= 1;
                  to += 1;
              }
          }
          let newContent;
          // if there is only plain text we have to use `insertText`
          // because this will keep the current marks
          if (isOnlyTextContent) {
              // if value is string, we can use it directly
              // otherwise if it is an array, we have to join it
              if (Array.isArray(value)) {
                  newContent = value.map(v => v.text || '').join('');
              }
              else if (typeof value === 'object' && !!value && !!value.text) {
                  newContent = value.text;
              }
              else {
                  newContent = value;
              }
              tr.insertText(newContent, from, to);
          }
          else {
              newContent = content;
              tr.replaceWith(from, to, newContent);
          }
          // set cursor at end of inserted content
          if (options.updateSelection) {
              selectionToInsertionEnd(tr, tr.steps.length - 1, -1);
          }
          if (options.applyInputRules) {
              tr.setMeta('applyInputRules', { from, text: newContent });
          }
          if (options.applyPasteRules) {
              tr.setMeta('applyPasteRules', { from, text: newContent });
          }
      }
      return true;
  };

  const joinUp = () => ({ state, dispatch }) => {
      return commands$1.joinUp(state, dispatch);
  };
  const joinDown = () => ({ state, dispatch }) => {
      return commands$1.joinDown(state, dispatch);
  };
  const joinBackward = () => ({ state, dispatch }) => {
      return commands$1.joinBackward(state, dispatch);
  };
  const joinForward = () => ({ state, dispatch }) => {
      return commands$1.joinForward(state, dispatch);
  };

  const joinItemBackward = () => ({ tr, state, dispatch, }) => {
      try {
          const point = transform.joinPoint(state.doc, state.selection.$from.pos, -1);
          if (point === null || point === undefined) {
              return false;
          }
          tr.join(point, 2);
          if (dispatch) {
              dispatch(tr);
          }
          return true;
      }
      catch {
          return false;
      }
  };

  const joinItemForward = () => ({ state, dispatch, tr, }) => {
      try {
          const point = transform.joinPoint(state.doc, state.selection.$from.pos, +1);
          if (point === null || point === undefined) {
              return false;
          }
          tr.join(point, 2);
          if (dispatch) {
              dispatch(tr);
          }
          return true;
      }
      catch (e) {
          return false;
      }
  };

  const joinTextblockBackward = () => ({ state, dispatch }) => {
      return commands$1.joinTextblockBackward(state, dispatch);
  };

  const joinTextblockForward = () => ({ state, dispatch }) => {
      return commands$1.joinTextblockForward(state, dispatch);
  };

  function isMacOS() {
      return typeof navigator !== 'undefined'
          ? /Mac/.test(navigator.platform)
          : false;
  }

  function normalizeKeyName(name) {
      const parts = name.split(/-(?!$)/);
      let result = parts[parts.length - 1];
      if (result === 'Space') {
          result = ' ';
      }
      let alt;
      let ctrl;
      let shift;
      let meta;
      for (let i = 0; i < parts.length - 1; i += 1) {
          const mod = parts[i];
          if (/^(cmd|meta|m)$/i.test(mod)) {
              meta = true;
          }
          else if (/^a(lt)?$/i.test(mod)) {
              alt = true;
          }
          else if (/^(c|ctrl|control)$/i.test(mod)) {
              ctrl = true;
          }
          else if (/^s(hift)?$/i.test(mod)) {
              shift = true;
          }
          else if (/^mod$/i.test(mod)) {
              if (isiOS() || isMacOS()) {
                  meta = true;
              }
              else {
                  ctrl = true;
              }
          }
          else {
              throw new Error(`Unrecognized modifier name: ${mod}`);
          }
      }
      if (alt) {
          result = `Alt-${result}`;
      }
      if (ctrl) {
          result = `Ctrl-${result}`;
      }
      if (meta) {
          result = `Meta-${result}`;
      }
      if (shift) {
          result = `Shift-${result}`;
      }
      return result;
  }
  const keyboardShortcut = name => ({ editor, view, tr, dispatch, }) => {
      const keys = normalizeKeyName(name).split(/-(?!$)/);
      const key = keys.find(item => !['Alt', 'Ctrl', 'Meta', 'Shift'].includes(item));
      const event = new KeyboardEvent('keydown', {
          key: key === 'Space'
              ? ' '
              : key,
          altKey: keys.includes('Alt'),
          ctrlKey: keys.includes('Ctrl'),
          metaKey: keys.includes('Meta'),
          shiftKey: keys.includes('Shift'),
          bubbles: true,
          cancelable: true,
      });
      const capturedTransaction = editor.captureTransaction(() => {
          view.someProp('handleKeyDown', f => f(view, event));
      });
      capturedTransaction === null || capturedTransaction === void 0 ? void 0 : capturedTransaction.steps.forEach(step => {
          const newStep = step.map(tr.mapping);
          if (newStep && dispatch) {
              tr.maybeStep(newStep);
          }
      });
      return true;
  };

  function isNodeActive(state, typeOrName, attributes = {}) {
      const { from, to, empty } = state.selection;
      const type = typeOrName ? getNodeType(typeOrName, state.schema) : null;
      const nodeRanges = [];
      state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.isText) {
              return;
          }
          const relativeFrom = Math.max(from, pos);
          const relativeTo = Math.min(to, pos + node.nodeSize);
          nodeRanges.push({
              node,
              from: relativeFrom,
              to: relativeTo,
          });
      });
      const selectionRange = to - from;
      const matchedNodeRanges = nodeRanges
          .filter(nodeRange => {
          if (!type) {
              return true;
          }
          return type.name === nodeRange.node.type.name;
      })
          .filter(nodeRange => objectIncludes(nodeRange.node.attrs, attributes, { strict: false }));
      if (empty) {
          return !!matchedNodeRanges.length;
      }
      const range = matchedNodeRanges.reduce((sum, nodeRange) => sum + nodeRange.to - nodeRange.from, 0);
      return range >= selectionRange;
  }

  const lift = (typeOrName, attributes = {}) => ({ state, dispatch }) => {
      const type = getNodeType(typeOrName, state.schema);
      const isActive = isNodeActive(state, type, attributes);
      if (!isActive) {
          return false;
      }
      return commands$1.lift(state, dispatch);
  };

  const liftEmptyBlock = () => ({ state, dispatch }) => {
      return commands$1.liftEmptyBlock(state, dispatch);
  };

  const liftListItem = typeOrName => ({ state, dispatch }) => {
      const type = getNodeType(typeOrName, state.schema);
      return schemaList.liftListItem(type)(state, dispatch);
  };

  const newlineInCode = () => ({ state, dispatch }) => {
      return commands$1.newlineInCode(state, dispatch);
  };

  /**
   * Get the type of a schema item by its name.
   * @param name The name of the schema item
   * @param schema The Prosemiror schema to search in
   * @returns The type of the schema item (`node` or `mark`), or null if it doesn't exist
   */
  function getSchemaTypeNameByName(name, schema) {
      if (schema.nodes[name]) {
          return 'node';
      }
      if (schema.marks[name]) {
          return 'mark';
      }
      return null;
  }

  /**
   * Remove a property or an array of properties from an object
   * @param obj Object
   * @param key Key to remove
   */
  function deleteProps(obj, propOrProps) {
      const props = typeof propOrProps === 'string'
          ? [propOrProps]
          : propOrProps;
      return Object
          .keys(obj)
          .reduce((newObj, prop) => {
          if (!props.includes(prop)) {
              newObj[prop] = obj[prop];
          }
          return newObj;
      }, {});
  }

  const resetAttributes = (typeOrName, attributes) => ({ tr, state, dispatch }) => {
      let nodeType = null;
      let markType = null;
      const schemaType = getSchemaTypeNameByName(typeof typeOrName === 'string' ? typeOrName : typeOrName.name, state.schema);
      if (!schemaType) {
          return false;
      }
      if (schemaType === 'node') {
          nodeType = getNodeType(typeOrName, state.schema);
      }
      if (schemaType === 'mark') {
          markType = getMarkType(typeOrName, state.schema);
      }
      if (dispatch) {
          tr.selection.ranges.forEach(range => {
              state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
                  if (nodeType && nodeType === node.type) {
                      tr.setNodeMarkup(pos, undefined, deleteProps(node.attrs, attributes));
                  }
                  if (markType && node.marks.length) {
                      node.marks.forEach(mark => {
                          if (markType === mark.type) {
                              tr.addMark(pos, pos + node.nodeSize, markType.create(deleteProps(mark.attrs, attributes)));
                          }
                      });
                  }
              });
          });
      }
      return true;
  };

  const scrollIntoView = () => ({ tr, dispatch }) => {
      if (dispatch) {
          tr.scrollIntoView();
      }
      return true;
  };

  const selectAll = () => ({ tr, commands }) => {
      return commands.setTextSelection({
          from: 0,
          to: tr.doc.content.size,
      });
  };

  const selectNodeBackward = () => ({ state, dispatch }) => {
      return commands$1.selectNodeBackward(state, dispatch);
  };

  const selectNodeForward = () => ({ state, dispatch }) => {
      return commands$1.selectNodeForward(state, dispatch);
  };

  const selectParentNode = () => ({ state, dispatch }) => {
      return commands$1.selectParentNode(state, dispatch);
  };

  // @ts-ignore
  const selectTextblockEnd = () => ({ state, dispatch }) => {
      return commands$1.selectTextblockEnd(state, dispatch);
  };

  // @ts-ignore
  const selectTextblockStart = () => ({ state, dispatch }) => {
      return commands$1.selectTextblockStart(state, dispatch);
  };

  /**
   * Create a new Prosemirror document node from content.
   * @param content The JSON or HTML content to create the document from
   * @param schema The Prosemirror schema to use for the document
   * @param parseOptions Options for the parser
   * @returns The created Prosemirror document node
   */
  function createDocument(content, schema, parseOptions = {}) {
      return createNodeFromContent(content, schema, { slice: false, parseOptions });
  }

  const setContent = (content, emitUpdate = false, parseOptions = {}) => ({ tr, editor, dispatch }) => {
      const { doc } = tr;
      const document = createDocument(content, editor.schema, parseOptions);
      if (dispatch) {
          tr.replaceWith(0, doc.content.size, document).setMeta('preventUpdate', !emitUpdate);
      }
      return true;
  };

  function getMarkAttributes(state, typeOrName) {
      const type = getMarkType(typeOrName, state.schema);
      const { from, to, empty } = state.selection;
      const marks = [];
      if (empty) {
          if (state.storedMarks) {
              marks.push(...state.storedMarks);
          }
          marks.push(...state.selection.$head.marks());
      }
      else {
          state.doc.nodesBetween(from, to, node => {
              marks.push(...node.marks);
          });
      }
      const mark = marks.find(markItem => markItem.type.name === type.name);
      if (!mark) {
          return {};
      }
      return { ...mark.attrs };
  }

  /**
   * Returns a new `Transform` based on all steps of the passed transactions.
   * @param oldDoc The Prosemirror node to start from
   * @param transactions The transactions to combine
   * @returns A new `Transform` with all steps of the passed transactions
   */
  function combineTransactionSteps(oldDoc, transactions) {
      const transform$1 = new transform.Transform(oldDoc);
      transactions.forEach(transaction => {
          transaction.steps.forEach(step => {
              transform$1.step(step);
          });
      });
      return transform$1;
  }

  /**
   * Gets the default block type at a given match
   * @param match The content match to get the default block type from
   * @returns The default block type or null
   */
  function defaultBlockAt(match) {
      for (let i = 0; i < match.edgeCount; i += 1) {
          const { type } = match.edge(i);
          if (type.isTextblock && !type.hasRequiredAttrs()) {
              return type;
          }
      }
      return null;
  }

  /**
   * Find children inside a Prosemirror node that match a predicate.
   * @param node The Prosemirror node to search in
   * @param predicate The predicate to match
   * @returns An array of nodes with their positions
   */
  function findChildren(node, predicate) {
      const nodesWithPos = [];
      node.descendants((child, pos) => {
          if (predicate(child)) {
              nodesWithPos.push({
                  node: child,
                  pos,
              });
          }
      });
      return nodesWithPos;
  }

  /**
   * Same as `findChildren` but searches only within a `range`.
   * @param node The Prosemirror node to search in
   * @param range The range to search in
   * @param predicate The predicate to match
   * @returns An array of nodes with their positions
   */
  function findChildrenInRange(node, range, predicate) {
      const nodesWithPos = [];
      // if (range.from === range.to) {
      //   const nodeAt = node.nodeAt(range.from)
      //   if (nodeAt) {
      //     nodesWithPos.push({
      //       node: nodeAt,
      //       pos: range.from,
      //     })
      //   }
      // }
      node.nodesBetween(range.from, range.to, (child, pos) => {
          if (predicate(child)) {
              nodesWithPos.push({
                  node: child,
                  pos,
              });
          }
      });
      return nodesWithPos;
  }

  /**
   * Finds the closest parent node to a resolved position that matches a predicate.
   * @param $pos The resolved position to search from
   * @param predicate The predicate to match
   * @returns The closest parent node to the resolved position that matches the predicate
   * @example ```js
   * findParentNodeClosestToPos($from, node => node.type.name === 'paragraph')
   * ```
   */
  function findParentNodeClosestToPos($pos, predicate) {
      for (let i = $pos.depth; i > 0; i -= 1) {
          const node = $pos.node(i);
          if (predicate(node)) {
              return {
                  pos: i > 0 ? $pos.before(i) : 0,
                  start: $pos.start(i),
                  depth: i,
                  node,
              };
          }
      }
  }

  /**
   * Finds the closest parent node to the current selection that matches a predicate.
   * @param predicate The predicate to match
   * @returns A command that finds the closest parent node to the current selection that matches the predicate
   * @example ```js
   * findParentNode(node => node.type.name === 'paragraph')
   * ```
   */
  function findParentNode(predicate) {
      return (selection) => findParentNodeClosestToPos(selection.$from, predicate);
  }

  function getHTMLFromFragment(fragment, schema) {
      const documentFragment = model.DOMSerializer.fromSchema(schema).serializeFragment(fragment);
      const temporaryDocument = document.implementation.createHTMLDocument();
      const container = temporaryDocument.createElement('div');
      container.appendChild(documentFragment);
      return container.innerHTML;
  }

  function getSchema(extensions, editor) {
      const resolvedExtensions = ExtensionManager.resolve(extensions);
      return getSchemaByResolvedExtensions(resolvedExtensions, editor);
  }

  /**
   * Generate HTML from a JSONContent
   * @param doc The JSONContent to generate HTML from
   * @param extensions The extensions to use for the schema
   * @returns The generated HTML
   */
  function generateHTML(doc, extensions) {
      const schema = getSchema(extensions);
      const contentNode = model.Node.fromJSON(schema, doc);
      return getHTMLFromFragment(contentNode.content, schema);
  }

  /**
   * Generate JSONContent from HTML
   * @param html The HTML to generate JSONContent from
   * @param extensions The extensions to use for the schema
   * @returns The generated JSONContent
   */
  function generateJSON(html, extensions) {
      const schema = getSchema(extensions);
      const dom = elementFromString(html);
      return model.DOMParser.fromSchema(schema).parse(dom).toJSON();
  }

  /**
   * Gets the text of a Prosemirror node
   * @param node The Prosemirror node
   * @param options Options for the text serializer & block separator
   * @returns The text of the node
   * @example ```js
   * const text = getText(node, { blockSeparator: '\n' })
   * ```
   */
  function getText(node, options) {
      const range = {
          from: 0,
          to: node.content.size,
      };
      return getTextBetween(node, range, options);
  }

  /**
   * Generate raw text from a JSONContent
   * @param doc The JSONContent to generate text from
   * @param extensions The extensions to use for the schema
   * @param options Options for the text generation f.e. blockSeparator or textSerializers
   * @returns The generated text
   */
  function generateText(doc, extensions, options) {
      const { blockSeparator = '\n\n', textSerializers = {} } = options || {};
      const schema = getSchema(extensions);
      const contentNode = model.Node.fromJSON(schema, doc);
      return getText(contentNode, {
          blockSeparator,
          textSerializers: {
              ...getTextSerializersFromSchema(schema),
              ...textSerializers,
          },
      });
  }

  function getNodeAttributes(state, typeOrName) {
      const type = getNodeType(typeOrName, state.schema);
      const { from, to } = state.selection;
      const nodes = [];
      state.doc.nodesBetween(from, to, node => {
          nodes.push(node);
      });
      const node = nodes.reverse().find(nodeItem => nodeItem.type.name === type.name);
      if (!node) {
          return {};
      }
      return { ...node.attrs };
  }

  /**
   * Get node or mark attributes by type or name on the current editor state
   * @param state The current editor state
   * @param typeOrName The node or mark type or name
   * @returns The attributes of the node or mark or an empty object
   */
  function getAttributes(state, typeOrName) {
      const schemaType = getSchemaTypeNameByName(typeof typeOrName === 'string' ? typeOrName : typeOrName.name, state.schema);
      if (schemaType === 'node') {
          return getNodeAttributes(state, typeOrName);
      }
      if (schemaType === 'mark') {
          return getMarkAttributes(state, typeOrName);
      }
      return {};
  }

  /**
   * Removes duplicated values within an array.
   * Supports numbers, strings and objects.
   */
  function removeDuplicates(array, by = JSON.stringify) {
      const seen = {};
      return array.filter(item => {
          const key = by(item);
          return Object.prototype.hasOwnProperty.call(seen, key)
              ? false
              : (seen[key] = true);
      });
  }

  /**
   * Removes duplicated ranges and ranges that are
   * fully captured by other ranges.
   */
  function simplifyChangedRanges(changes) {
      const uniqueChanges = removeDuplicates(changes);
      return uniqueChanges.length === 1
          ? uniqueChanges
          : uniqueChanges.filter((change, index) => {
              const rest = uniqueChanges.filter((_, i) => i !== index);
              return !rest.some(otherChange => {
                  return change.oldRange.from >= otherChange.oldRange.from
                      && change.oldRange.to <= otherChange.oldRange.to
                      && change.newRange.from >= otherChange.newRange.from
                      && change.newRange.to <= otherChange.newRange.to;
              });
          });
  }
  /**
   * Returns a list of changed ranges
   * based on the first and last state of all steps.
   */
  function getChangedRanges(transform) {
      const { mapping, steps } = transform;
      const changes = [];
      mapping.maps.forEach((stepMap, index) => {
          const ranges = [];
          // This accounts for step changes where no range was actually altered
          // e.g. when setting a mark, node attribute, etc.
          // @ts-ignore
          if (!stepMap.ranges.length) {
              const { from, to } = steps[index];
              if (from === undefined || to === undefined) {
                  return;
              }
              ranges.push({ from, to });
          }
          else {
              stepMap.forEach((from, to) => {
                  ranges.push({ from, to });
              });
          }
          ranges.forEach(({ from, to }) => {
              const newStart = mapping.slice(index).map(from, -1);
              const newEnd = mapping.slice(index).map(to);
              const oldStart = mapping.invert().map(newStart, -1);
              const oldEnd = mapping.invert().map(newEnd);
              changes.push({
                  oldRange: {
                      from: oldStart,
                      to: oldEnd,
                  },
                  newRange: {
                      from: newStart,
                      to: newEnd,
                  },
              });
          });
      });
      return simplifyChangedRanges(changes);
  }

  function getDebugJSON(node, startOffset = 0) {
      const isTopNode = node.type === node.type.schema.topNodeType;
      const increment = isTopNode ? 0 : 1;
      const from = startOffset;
      const to = from + node.nodeSize;
      const marks = node.marks.map(mark => {
          const output = {
              type: mark.type.name,
          };
          if (Object.keys(mark.attrs).length) {
              output.attrs = { ...mark.attrs };
          }
          return output;
      });
      const attrs = { ...node.attrs };
      const output = {
          type: node.type.name,
          from,
          to,
      };
      if (Object.keys(attrs).length) {
          output.attrs = attrs;
      }
      if (marks.length) {
          output.marks = marks;
      }
      if (node.content.childCount) {
          output.content = [];
          node.forEach((child, offset) => {
              var _a;
              (_a = output.content) === null || _a === void 0 ? void 0 : _a.push(getDebugJSON(child, startOffset + offset + increment));
          });
      }
      if (node.text) {
          output.text = node.text;
      }
      return output;
  }

  function getMarksBetween(from, to, doc) {
      const marks = [];
      // get all inclusive marks on empty selection
      if (from === to) {
          doc
              .resolve(from)
              .marks()
              .forEach(mark => {
              const $pos = doc.resolve(from - 1);
              const range = getMarkRange($pos, mark.type);
              if (!range) {
                  return;
              }
              marks.push({
                  mark,
                  ...range,
              });
          });
      }
      else {
          doc.nodesBetween(from, to, (node, pos) => {
              if (!node || (node === null || node === void 0 ? void 0 : node.nodeSize) === undefined) {
                  return;
              }
              marks.push(...node.marks.map(mark => ({
                  from: pos,
                  to: pos + node.nodeSize,
                  mark,
              })));
          });
      }
      return marks;
  }

  /**
   * Finds the first node of a given type or name in the current selection.
   * @param state The editor state.
   * @param typeOrName The node type or name.
   * @param pos The position to start searching from.
   * @param maxDepth The maximum depth to search.
   * @returns The node and the depth as an array.
   */
  const getNodeAtPosition = (state, typeOrName, pos, maxDepth = 20) => {
      const $pos = state.doc.resolve(pos);
      let currentDepth = maxDepth;
      let node = null;
      while (currentDepth > 0 && node === null) {
          const currentNode = $pos.node(currentDepth);
          if ((currentNode === null || currentNode === void 0 ? void 0 : currentNode.type.name) === typeOrName) {
              node = currentNode;
          }
          else {
              currentDepth -= 1;
          }
      }
      return [node, currentDepth];
  };

  /**
   * Return attributes of an extension that should be splitted by keepOnSplit flag
   * @param extensionAttributes Array of extension attributes
   * @param typeName The type of the extension
   * @param attributes The attributes of the extension
   * @returns The splitted attributes
   */
  function getSplittedAttributes(extensionAttributes, typeName, attributes) {
      return Object.fromEntries(Object
          .entries(attributes)
          .filter(([name]) => {
          const extensionAttribute = extensionAttributes.find(item => {
              return item.type === typeName && item.name === name;
          });
          if (!extensionAttribute) {
              return false;
          }
          return extensionAttribute.attribute.keepOnSplit;
      }));
  }

  function isMarkActive(state, typeOrName, attributes = {}) {
      const { empty, ranges } = state.selection;
      const type = typeOrName ? getMarkType(typeOrName, state.schema) : null;
      if (empty) {
          return !!(state.storedMarks || state.selection.$from.marks())
              .filter(mark => {
              if (!type) {
                  return true;
              }
              return type.name === mark.type.name;
          })
              .find(mark => objectIncludes(mark.attrs, attributes, { strict: false }));
      }
      let selectionRange = 0;
      const markRanges = [];
      ranges.forEach(({ $from, $to }) => {
          const from = $from.pos;
          const to = $to.pos;
          state.doc.nodesBetween(from, to, (node, pos) => {
              if (!node.isText && !node.marks.length) {
                  return;
              }
              const relativeFrom = Math.max(from, pos);
              const relativeTo = Math.min(to, pos + node.nodeSize);
              const range = relativeTo - relativeFrom;
              selectionRange += range;
              markRanges.push(...node.marks.map(mark => ({
                  mark,
                  from: relativeFrom,
                  to: relativeTo,
              })));
          });
      });
      if (selectionRange === 0) {
          return false;
      }
      // calculate range of matched mark
      const matchedRange = markRanges
          .filter(markRange => {
          if (!type) {
              return true;
          }
          return type.name === markRange.mark.type.name;
      })
          .filter(markRange => objectIncludes(markRange.mark.attrs, attributes, { strict: false }))
          .reduce((sum, markRange) => sum + markRange.to - markRange.from, 0);
      // calculate range of marks that excludes the searched mark
      // for example `code` doesn’t allow any other marks
      const excludedRange = markRanges
          .filter(markRange => {
          if (!type) {
              return true;
          }
          return markRange.mark.type !== type && markRange.mark.type.excludes(type);
      })
          .reduce((sum, markRange) => sum + markRange.to - markRange.from, 0);
      // we only include the result of `excludedRange`
      // if there is a match at all
      const range = matchedRange > 0 ? matchedRange + excludedRange : matchedRange;
      return range >= selectionRange;
  }

  function isActive(state, name, attributes = {}) {
      if (!name) {
          return isNodeActive(state, null, attributes) || isMarkActive(state, null, attributes);
      }
      const schemaType = getSchemaTypeNameByName(name, state.schema);
      if (schemaType === 'node') {
          return isNodeActive(state, name, attributes);
      }
      if (schemaType === 'mark') {
          return isMarkActive(state, name, attributes);
      }
      return false;
  }

  const isAtEndOfNode = (state, nodeType) => {
      const { $from, $to, $anchor } = state.selection;
      if (nodeType) {
          const parentNode = findParentNode(node => node.type.name === nodeType)(state.selection);
          if (!parentNode) {
              return false;
          }
          const $parentPos = state.doc.resolve(parentNode.pos + 1);
          if ($anchor.pos + 1 === $parentPos.end()) {
              return true;
          }
          return false;
      }
      if ($to.parentOffset < $to.parent.nodeSize - 2 || $from.pos !== $to.pos) {
          return false;
      }
      return true;
  };

  const isAtStartOfNode = (state) => {
      const { $from, $to } = state.selection;
      if ($from.parentOffset > 0 || $from.pos !== $to.pos) {
          return false;
      }
      return true;
  };

  function isList(name, extensions) {
      const { nodeExtensions } = splitExtensions(extensions);
      const extension = nodeExtensions.find(item => item.name === name);
      if (!extension) {
          return false;
      }
      const context = {
          name: extension.name,
          options: extension.options,
          storage: extension.storage,
      };
      const group = callOrReturn(getExtensionField(extension, 'group', context));
      if (typeof group !== 'string') {
          return false;
      }
      return group.split(' ').includes('list');
  }

  function isNodeEmpty(node) {
      var _a;
      const defaultContent = (_a = node.type.createAndFill()) === null || _a === void 0 ? void 0 : _a.toJSON();
      const content = node.toJSON();
      return JSON.stringify(defaultContent) === JSON.stringify(content);
  }

  function isNodeSelection(value) {
      return value instanceof state.NodeSelection;
  }

  function posToDOMRect(view, from, to) {
      const minPos = 0;
      const maxPos = view.state.doc.content.size;
      const resolvedFrom = minMax(from, minPos, maxPos);
      const resolvedEnd = minMax(to, minPos, maxPos);
      const start = view.coordsAtPos(resolvedFrom);
      const end = view.coordsAtPos(resolvedEnd, -1);
      const top = Math.min(start.top, end.top);
      const bottom = Math.max(start.bottom, end.bottom);
      const left = Math.min(start.left, end.left);
      const right = Math.max(start.right, end.right);
      const width = right - left;
      const height = bottom - top;
      const x = left;
      const y = top;
      const data = {
          top,
          bottom,
          left,
          right,
          width,
          height,
          x,
          y,
      };
      return {
          ...data,
          toJSON: () => data,
      };
  }

  function canSetMark(state, tr, newMarkType) {
      var _a;
      const { selection } = tr;
      let cursor = null;
      if (isTextSelection(selection)) {
          cursor = selection.$cursor;
      }
      if (cursor) {
          const currentMarks = (_a = state.storedMarks) !== null && _a !== void 0 ? _a : cursor.marks();
          // There can be no current marks that exclude the new mark
          return (!!newMarkType.isInSet(currentMarks)
              || !currentMarks.some(mark => mark.type.excludes(newMarkType)));
      }
      const { ranges } = selection;
      return ranges.some(({ $from, $to }) => {
          let someNodeSupportsMark = $from.depth === 0
              ? state.doc.inlineContent && state.doc.type.allowsMarkType(newMarkType)
              : false;
          state.doc.nodesBetween($from.pos, $to.pos, (node, _pos, parent) => {
              // If we already found a mark that we can enable, return false to bypass the remaining search
              if (someNodeSupportsMark) {
                  return false;
              }
              if (node.isInline) {
                  const parentAllowsMarkType = !parent || parent.type.allowsMarkType(newMarkType);
                  const currentMarksAllowMarkType = !!newMarkType.isInSet(node.marks)
                      || !node.marks.some(otherMark => otherMark.type.excludes(newMarkType));
                  someNodeSupportsMark = parentAllowsMarkType && currentMarksAllowMarkType;
              }
              return !someNodeSupportsMark;
          });
          return someNodeSupportsMark;
      });
  }
  const setMark = (typeOrName, attributes = {}) => ({ tr, state, dispatch }) => {
      const { selection } = tr;
      const { empty, ranges } = selection;
      const type = getMarkType(typeOrName, state.schema);
      if (dispatch) {
          if (empty) {
              const oldAttributes = getMarkAttributes(state, type);
              tr.addStoredMark(type.create({
                  ...oldAttributes,
                  ...attributes,
              }));
          }
          else {
              ranges.forEach(range => {
                  const from = range.$from.pos;
                  const to = range.$to.pos;
                  state.doc.nodesBetween(from, to, (node, pos) => {
                      const trimmedFrom = Math.max(pos, from);
                      const trimmedTo = Math.min(pos + node.nodeSize, to);
                      const someHasMark = node.marks.find(mark => mark.type === type);
                      // if there is already a mark of this type
                      // we know that we have to merge its attributes
                      // otherwise we add a fresh new mark
                      if (someHasMark) {
                          node.marks.forEach(mark => {
                              if (type === mark.type) {
                                  tr.addMark(trimmedFrom, trimmedTo, type.create({
                                      ...mark.attrs,
                                      ...attributes,
                                  }));
                              }
                          });
                      }
                      else {
                          tr.addMark(trimmedFrom, trimmedTo, type.create(attributes));
                      }
                  });
              });
          }
      }
      return canSetMark(state, tr, type);
  };

  const setMeta = (key, value) => ({ tr }) => {
      tr.setMeta(key, value);
      return true;
  };

  const setNode = (typeOrName, attributes = {}) => ({ state, dispatch, chain }) => {
      const type = getNodeType(typeOrName, state.schema);
      // TODO: use a fallback like insertContent?
      if (!type.isTextblock) {
          console.warn('[tiptap warn]: Currently "setNode()" only supports text block nodes.');
          return false;
      }
      return (chain()
          // try to convert node to default node if needed
          .command(({ commands }) => {
          const canSetBlock = commands$1.setBlockType(type, attributes)(state);
          if (canSetBlock) {
              return true;
          }
          return commands.clearNodes();
      })
          .command(({ state: updatedState }) => {
          return commands$1.setBlockType(type, attributes)(updatedState, dispatch);
      })
          .run());
  };

  const setNodeSelection = position => ({ tr, dispatch }) => {
      if (dispatch) {
          const { doc } = tr;
          const from = minMax(position, 0, doc.content.size);
          const selection = state.NodeSelection.create(doc, from);
          tr.setSelection(selection);
      }
      return true;
  };

  const setTextSelection = position => ({ tr, dispatch }) => {
      if (dispatch) {
          const { doc } = tr;
          const { from, to } = typeof position === 'number' ? { from: position, to: position } : position;
          const minPos = state.TextSelection.atStart(doc).from;
          const maxPos = state.TextSelection.atEnd(doc).to;
          const resolvedFrom = minMax(from, minPos, maxPos);
          const resolvedEnd = minMax(to, minPos, maxPos);
          const selection = state.TextSelection.create(doc, resolvedFrom, resolvedEnd);
          tr.setSelection(selection);
      }
      return true;
  };

  const sinkListItem = typeOrName => ({ state, dispatch }) => {
      const type = getNodeType(typeOrName, state.schema);
      return schemaList.sinkListItem(type)(state, dispatch);
  };

  function ensureMarks(state, splittableMarks) {
      const marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());
      if (marks) {
          const filteredMarks = marks.filter(mark => splittableMarks === null || splittableMarks === void 0 ? void 0 : splittableMarks.includes(mark.type.name));
          state.tr.ensureMarks(filteredMarks);
      }
  }
  const splitBlock = ({ keepMarks = true } = {}) => ({ tr, state: state$1, dispatch, editor, }) => {
      const { selection, doc } = tr;
      const { $from, $to } = selection;
      const extensionAttributes = editor.extensionManager.attributes;
      const newAttributes = getSplittedAttributes(extensionAttributes, $from.node().type.name, $from.node().attrs);
      if (selection instanceof state.NodeSelection && selection.node.isBlock) {
          if (!$from.parentOffset || !transform.canSplit(doc, $from.pos)) {
              return false;
          }
          if (dispatch) {
              if (keepMarks) {
                  ensureMarks(state$1, editor.extensionManager.splittableMarks);
              }
              tr.split($from.pos).scrollIntoView();
          }
          return true;
      }
      if (!$from.parent.isBlock) {
          return false;
      }
      if (dispatch) {
          const atEnd = $to.parentOffset === $to.parent.content.size;
          if (selection instanceof state.TextSelection) {
              tr.deleteSelection();
          }
          const deflt = $from.depth === 0
              ? undefined
              : defaultBlockAt($from.node(-1).contentMatchAt($from.indexAfter(-1)));
          let types = atEnd && deflt
              ? [
                  {
                      type: deflt,
                      attrs: newAttributes,
                  },
              ]
              : undefined;
          let can = transform.canSplit(tr.doc, tr.mapping.map($from.pos), 1, types);
          if (!types
              && !can
              && transform.canSplit(tr.doc, tr.mapping.map($from.pos), 1, deflt ? [{ type: deflt }] : undefined)) {
              can = true;
              types = deflt
                  ? [
                      {
                          type: deflt,
                          attrs: newAttributes,
                      },
                  ]
                  : undefined;
          }
          if (can) {
              tr.split(tr.mapping.map($from.pos), 1, types);
              if (deflt && !atEnd && !$from.parentOffset && $from.parent.type !== deflt) {
                  const first = tr.mapping.map($from.before());
                  const $first = tr.doc.resolve(first);
                  if ($from.node(-1).canReplaceWith($first.index(), $first.index() + 1, deflt)) {
                      tr.setNodeMarkup(tr.mapping.map($from.before()), deflt);
                  }
              }
          }
          if (keepMarks) {
              ensureMarks(state$1, editor.extensionManager.splittableMarks);
          }
          tr.scrollIntoView();
      }
      return true;
  };

  const splitListItem = typeOrName => ({ tr, state: state$1, dispatch, editor, }) => {
      var _a;
      const type = getNodeType(typeOrName, state$1.schema);
      const { $from, $to } = state$1.selection;
      // @ts-ignore
      // eslint-disable-next-line
      const node = state$1.selection.node;
      if ((node && node.isBlock) || $from.depth < 2 || !$from.sameParent($to)) {
          return false;
      }
      const grandParent = $from.node(-1);
      if (grandParent.type !== type) {
          return false;
      }
      const extensionAttributes = editor.extensionManager.attributes;
      if ($from.parent.content.size === 0 && $from.node(-1).childCount === $from.indexAfter(-1)) {
          // In an empty block. If this is a nested list, the wrapping
          // list item should be split. Otherwise, bail out and let next
          // command handle lifting.
          if ($from.depth === 2
              || $from.node(-3).type !== type
              || $from.index(-2) !== $from.node(-2).childCount - 1) {
              return false;
          }
          if (dispatch) {
              let wrap = model.Fragment.empty;
              // eslint-disable-next-line
              const depthBefore = $from.index(-1) ? 1 : $from.index(-2) ? 2 : 3;
              // Build a fragment containing empty versions of the structure
              // from the outer list item to the parent node of the cursor
              for (let d = $from.depth - depthBefore; d >= $from.depth - 3; d -= 1) {
                  wrap = model.Fragment.from($from.node(d).copy(wrap));
              }
              // eslint-disable-next-line
              const depthAfter = $from.indexAfter(-1) < $from.node(-2).childCount ? 1 : $from.indexAfter(-2) < $from.node(-3).childCount ? 2 : 3;
              // Add a second list item with an empty default start node
              const newNextTypeAttributes = getSplittedAttributes(extensionAttributes, $from.node().type.name, $from.node().attrs);
              const nextType = ((_a = type.contentMatch.defaultType) === null || _a === void 0 ? void 0 : _a.createAndFill(newNextTypeAttributes)) || undefined;
              wrap = wrap.append(model.Fragment.from(type.createAndFill(null, nextType) || undefined));
              const start = $from.before($from.depth - (depthBefore - 1));
              tr.replace(start, $from.after(-depthAfter), new model.Slice(wrap, 4 - depthBefore, 0));
              let sel = -1;
              tr.doc.nodesBetween(start, tr.doc.content.size, (n, pos) => {
                  if (sel > -1) {
                      return false;
                  }
                  if (n.isTextblock && n.content.size === 0) {
                      sel = pos + 1;
                  }
              });
              if (sel > -1) {
                  tr.setSelection(state.TextSelection.near(tr.doc.resolve(sel)));
              }
              tr.scrollIntoView();
          }
          return true;
      }
      const nextType = $to.pos === $from.end() ? grandParent.contentMatchAt(0).defaultType : null;
      const newTypeAttributes = getSplittedAttributes(extensionAttributes, grandParent.type.name, grandParent.attrs);
      const newNextTypeAttributes = getSplittedAttributes(extensionAttributes, $from.node().type.name, $from.node().attrs);
      tr.delete($from.pos, $to.pos);
      const types = nextType
          ? [
              { type, attrs: newTypeAttributes },
              { type: nextType, attrs: newNextTypeAttributes },
          ]
          : [{ type, attrs: newTypeAttributes }];
      if (!transform.canSplit(tr.doc, $from.pos, 2)) {
          return false;
      }
      if (dispatch) {
          const { selection, storedMarks } = state$1;
          const { splittableMarks } = editor.extensionManager;
          const marks = storedMarks || (selection.$to.parentOffset && selection.$from.marks());
          tr.split($from.pos, 2, types).scrollIntoView();
          if (!marks || !dispatch) {
              return true;
          }
          const filteredMarks = marks.filter(mark => splittableMarks.includes(mark.type.name));
          tr.ensureMarks(filteredMarks);
      }
      return true;
  };

  const joinListBackwards = (tr, listType) => {
      const list = findParentNode(node => node.type === listType)(tr.selection);
      if (!list) {
          return true;
      }
      const before = tr.doc.resolve(Math.max(0, list.pos - 1)).before(list.depth);
      if (before === undefined) {
          return true;
      }
      const nodeBefore = tr.doc.nodeAt(before);
      const canJoinBackwards = list.node.type === (nodeBefore === null || nodeBefore === void 0 ? void 0 : nodeBefore.type) && transform.canJoin(tr.doc, list.pos);
      if (!canJoinBackwards) {
          return true;
      }
      tr.join(list.pos);
      return true;
  };
  const joinListForwards = (tr, listType) => {
      const list = findParentNode(node => node.type === listType)(tr.selection);
      if (!list) {
          return true;
      }
      const after = tr.doc.resolve(list.start).after(list.depth);
      if (after === undefined) {
          return true;
      }
      const nodeAfter = tr.doc.nodeAt(after);
      const canJoinForwards = list.node.type === (nodeAfter === null || nodeAfter === void 0 ? void 0 : nodeAfter.type) && transform.canJoin(tr.doc, after);
      if (!canJoinForwards) {
          return true;
      }
      tr.join(after);
      return true;
  };
  const toggleList = (listTypeOrName, itemTypeOrName, keepMarks, attributes = {}) => ({ editor, tr, state, dispatch, chain, commands, can, }) => {
      const { extensions, splittableMarks } = editor.extensionManager;
      const listType = getNodeType(listTypeOrName, state.schema);
      const itemType = getNodeType(itemTypeOrName, state.schema);
      const { selection, storedMarks } = state;
      const { $from, $to } = selection;
      const range = $from.blockRange($to);
      const marks = storedMarks || (selection.$to.parentOffset && selection.$from.marks());
      if (!range) {
          return false;
      }
      const parentList = findParentNode(node => isList(node.type.name, extensions))(selection);
      if (range.depth >= 1 && parentList && range.depth - parentList.depth <= 1) {
          // remove list
          if (parentList.node.type === listType) {
              return commands.liftListItem(itemType);
          }
          // change list type
          if (isList(parentList.node.type.name, extensions)
              && listType.validContent(parentList.node.content)
              && dispatch) {
              return chain()
                  .command(() => {
                  tr.setNodeMarkup(parentList.pos, listType);
                  return true;
              })
                  .command(() => joinListBackwards(tr, listType))
                  .command(() => joinListForwards(tr, listType))
                  .run();
          }
      }
      if (!keepMarks || !marks || !dispatch) {
          return chain()
              // try to convert node to default node if needed
              .command(() => {
              const canWrapInList = can().wrapInList(listType, attributes);
              if (canWrapInList) {
                  return true;
              }
              return commands.clearNodes();
          })
              .wrapInList(listType, attributes)
              .command(() => joinListBackwards(tr, listType))
              .command(() => joinListForwards(tr, listType))
              .run();
      }
      return (chain()
          // try to convert node to default node if needed
          .command(() => {
          const canWrapInList = can().wrapInList(listType, attributes);
          const filteredMarks = marks.filter(mark => splittableMarks.includes(mark.type.name));
          tr.ensureMarks(filteredMarks);
          if (canWrapInList) {
              return true;
          }
          return commands.clearNodes();
      })
          .wrapInList(listType, attributes)
          .command(() => joinListBackwards(tr, listType))
          .command(() => joinListForwards(tr, listType))
          .run());
  };

  const toggleMark = (typeOrName, attributes = {}, options = {}) => ({ state, commands }) => {
      const { extendEmptyMarkRange = false } = options;
      const type = getMarkType(typeOrName, state.schema);
      const isActive = isMarkActive(state, type, attributes);
      if (isActive) {
          return commands.unsetMark(type, { extendEmptyMarkRange });
      }
      return commands.setMark(type, attributes);
  };

  const toggleNode = (typeOrName, toggleTypeOrName, attributes = {}) => ({ state, commands }) => {
      const type = getNodeType(typeOrName, state.schema);
      const toggleType = getNodeType(toggleTypeOrName, state.schema);
      const isActive = isNodeActive(state, type, attributes);
      if (isActive) {
          return commands.setNode(toggleType);
      }
      return commands.setNode(type, attributes);
  };

  const toggleWrap = (typeOrName, attributes = {}) => ({ state, commands }) => {
      const type = getNodeType(typeOrName, state.schema);
      const isActive = isNodeActive(state, type, attributes);
      if (isActive) {
          return commands.lift(type);
      }
      return commands.wrapIn(type, attributes);
  };

  const undoInputRule = () => ({ state, dispatch }) => {
      const plugins = state.plugins;
      for (let i = 0; i < plugins.length; i += 1) {
          const plugin = plugins[i];
          let undoable;
          // @ts-ignore
          // eslint-disable-next-line
          if (plugin.spec.isInputRules && (undoable = plugin.getState(state))) {
              if (dispatch) {
                  const tr = state.tr;
                  const toUndo = undoable.transform;
                  for (let j = toUndo.steps.length - 1; j >= 0; j -= 1) {
                      tr.step(toUndo.steps[j].invert(toUndo.docs[j]));
                  }
                  if (undoable.text) {
                      const marks = tr.doc.resolve(undoable.from).marks();
                      tr.replaceWith(undoable.from, undoable.to, state.schema.text(undoable.text, marks));
                  }
                  else {
                      tr.delete(undoable.from, undoable.to);
                  }
              }
              return true;
          }
      }
      return false;
  };

  const unsetAllMarks = () => ({ tr, dispatch }) => {
      const { selection } = tr;
      const { empty, ranges } = selection;
      if (empty) {
          return true;
      }
      if (dispatch) {
          ranges.forEach(range => {
              tr.removeMark(range.$from.pos, range.$to.pos);
          });
      }
      return true;
  };

  const unsetMark = (typeOrName, options = {}) => ({ tr, state, dispatch }) => {
      var _a;
      const { extendEmptyMarkRange = false } = options;
      const { selection } = tr;
      const type = getMarkType(typeOrName, state.schema);
      const { $from, empty, ranges } = selection;
      if (!dispatch) {
          return true;
      }
      if (empty && extendEmptyMarkRange) {
          let { from, to } = selection;
          const attrs = (_a = $from.marks().find(mark => mark.type === type)) === null || _a === void 0 ? void 0 : _a.attrs;
          const range = getMarkRange($from, type, attrs);
          if (range) {
              from = range.from;
              to = range.to;
          }
          tr.removeMark(from, to, type);
      }
      else {
          ranges.forEach(range => {
              tr.removeMark(range.$from.pos, range.$to.pos, type);
          });
      }
      tr.removeStoredMark(type);
      return true;
  };

  const updateAttributes = (typeOrName, attributes = {}) => ({ tr, state, dispatch }) => {
      let nodeType = null;
      let markType = null;
      const schemaType = getSchemaTypeNameByName(typeof typeOrName === 'string' ? typeOrName : typeOrName.name, state.schema);
      if (!schemaType) {
          return false;
      }
      if (schemaType === 'node') {
          nodeType = getNodeType(typeOrName, state.schema);
      }
      if (schemaType === 'mark') {
          markType = getMarkType(typeOrName, state.schema);
      }
      if (dispatch) {
          tr.selection.ranges.forEach(range => {
              const from = range.$from.pos;
              const to = range.$to.pos;
              state.doc.nodesBetween(from, to, (node, pos) => {
                  if (nodeType && nodeType === node.type) {
                      tr.setNodeMarkup(pos, undefined, {
                          ...node.attrs,
                          ...attributes,
                      });
                  }
                  if (markType && node.marks.length) {
                      node.marks.forEach(mark => {
                          if (markType === mark.type) {
                              const trimmedFrom = Math.max(pos, from);
                              const trimmedTo = Math.min(pos + node.nodeSize, to);
                              tr.addMark(trimmedFrom, trimmedTo, markType.create({
                                  ...mark.attrs,
                                  ...attributes,
                              }));
                          }
                      });
                  }
              });
          });
      }
      return true;
  };

  const wrapIn = (typeOrName, attributes = {}) => ({ state, dispatch }) => {
      const type = getNodeType(typeOrName, state.schema);
      return commands$1.wrapIn(type, attributes)(state, dispatch);
  };

  const wrapInList = (typeOrName, attributes = {}) => ({ state, dispatch }) => {
      const type = getNodeType(typeOrName, state.schema);
      return schemaList.wrapInList(type, attributes)(state, dispatch);
  };

  var commands = /*#__PURE__*/Object.freeze({
    __proto__: null,
    blur: blur,
    clearContent: clearContent,
    clearNodes: clearNodes,
    command: command,
    createParagraphNear: createParagraphNear,
    cut: cut,
    deleteCurrentNode: deleteCurrentNode,
    deleteNode: deleteNode,
    deleteRange: deleteRange,
    deleteSelection: deleteSelection,
    enter: enter,
    exitCode: exitCode,
    extendMarkRange: extendMarkRange,
    first: first,
    focus: focus,
    forEach: forEach,
    insertContent: insertContent,
    insertContentAt: insertContentAt,
    joinUp: joinUp,
    joinDown: joinDown,
    joinBackward: joinBackward,
    joinForward: joinForward,
    joinItemBackward: joinItemBackward,
    joinItemForward: joinItemForward,
    joinTextblockBackward: joinTextblockBackward,
    joinTextblockForward: joinTextblockForward,
    keyboardShortcut: keyboardShortcut,
    lift: lift,
    liftEmptyBlock: liftEmptyBlock,
    liftListItem: liftListItem,
    newlineInCode: newlineInCode,
    resetAttributes: resetAttributes,
    scrollIntoView: scrollIntoView,
    selectAll: selectAll,
    selectNodeBackward: selectNodeBackward,
    selectNodeForward: selectNodeForward,
    selectParentNode: selectParentNode,
    selectTextblockEnd: selectTextblockEnd,
    selectTextblockStart: selectTextblockStart,
    setContent: setContent,
    setMark: setMark,
    setMeta: setMeta,
    setNode: setNode,
    setNodeSelection: setNodeSelection,
    setTextSelection: setTextSelection,
    sinkListItem: sinkListItem,
    splitBlock: splitBlock,
    splitListItem: splitListItem,
    toggleList: toggleList,
    toggleMark: toggleMark,
    toggleNode: toggleNode,
    toggleWrap: toggleWrap,
    undoInputRule: undoInputRule,
    unsetAllMarks: unsetAllMarks,
    unsetMark: unsetMark,
    updateAttributes: updateAttributes,
    wrapIn: wrapIn,
    wrapInList: wrapInList
  });

  const Commands = Extension.create({
      name: 'commands',
      addCommands() {
          return {
              ...commands,
          };
      },
  });

  const Editable = Extension.create({
      name: 'editable',
      addProseMirrorPlugins() {
          return [
              new state.Plugin({
                  key: new state.PluginKey('editable'),
                  props: {
                      editable: () => this.editor.options.editable,
                  },
              }),
          ];
      },
  });

  const FocusEvents = Extension.create({
      name: 'focusEvents',
      addProseMirrorPlugins() {
          const { editor } = this;
          return [
              new state.Plugin({
                  key: new state.PluginKey('focusEvents'),
                  props: {
                      handleDOMEvents: {
                          focus: (view, event) => {
                              editor.isFocused = true;
                              const transaction = editor.state.tr
                                  .setMeta('focus', { event })
                                  .setMeta('addToHistory', false);
                              view.dispatch(transaction);
                              return false;
                          },
                          blur: (view, event) => {
                              editor.isFocused = false;
                              const transaction = editor.state.tr
                                  .setMeta('blur', { event })
                                  .setMeta('addToHistory', false);
                              view.dispatch(transaction);
                              return false;
                          },
                      },
                  },
              }),
          ];
      },
  });

  const Keymap = Extension.create({
      name: 'keymap',
      addKeyboardShortcuts() {
          const handleBackspace = () => this.editor.commands.first(({ commands }) => [
              () => commands.undoInputRule(),
              // maybe convert first text block node to default node
              () => commands.command(({ tr }) => {
                  const { selection, doc } = tr;
                  const { empty, $anchor } = selection;
                  const { pos, parent } = $anchor;
                  const $parentPos = $anchor.parent.isTextblock && pos > 0 ? tr.doc.resolve(pos - 1) : $anchor;
                  const parentIsIsolating = $parentPos.parent.type.spec.isolating;
                  const parentPos = $anchor.pos - $anchor.parentOffset;
                  const isAtStart = (parentIsIsolating && $parentPos.parent.childCount === 1)
                      ? parentPos === $anchor.pos
                      : state.Selection.atStart(doc).from === pos;
                  if (!empty
                      || !parent.type.isTextblock
                      || parent.textContent.length
                      || !isAtStart
                      || (isAtStart && $anchor.parent.type.name === 'paragraph') // prevent clearNodes when no nodes to clear, otherwise history stack is appended
                  ) {
                      return false;
                  }
                  return commands.clearNodes();
              }),
              () => commands.deleteSelection(),
              () => commands.joinBackward(),
              () => commands.selectNodeBackward(),
          ]);
          const handleDelete = () => this.editor.commands.first(({ commands }) => [
              () => commands.deleteSelection(),
              () => commands.deleteCurrentNode(),
              () => commands.joinForward(),
              () => commands.selectNodeForward(),
          ]);
          const handleEnter = () => this.editor.commands.first(({ commands }) => [
              () => commands.newlineInCode(),
              () => commands.createParagraphNear(),
              () => commands.liftEmptyBlock(),
              () => commands.splitBlock(),
          ]);
          const baseKeymap = {
              Enter: handleEnter,
              'Mod-Enter': () => this.editor.commands.exitCode(),
              Backspace: handleBackspace,
              'Mod-Backspace': handleBackspace,
              'Shift-Backspace': handleBackspace,
              Delete: handleDelete,
              'Mod-Delete': handleDelete,
              'Mod-a': () => this.editor.commands.selectAll(),
          };
          const pcKeymap = {
              ...baseKeymap,
          };
          const macKeymap = {
              ...baseKeymap,
              'Ctrl-h': handleBackspace,
              'Alt-Backspace': handleBackspace,
              'Ctrl-d': handleDelete,
              'Ctrl-Alt-Backspace': handleDelete,
              'Alt-Delete': handleDelete,
              'Alt-d': handleDelete,
              'Ctrl-a': () => this.editor.commands.selectTextblockStart(),
              'Ctrl-e': () => this.editor.commands.selectTextblockEnd(),
          };
          if (isiOS() || isMacOS()) {
              return macKeymap;
          }
          return pcKeymap;
      },
      addProseMirrorPlugins() {
          return [
              // With this plugin we check if the whole document was selected and deleted.
              // In this case we will additionally call `clearNodes()` to convert e.g. a heading
              // to a paragraph if necessary.
              // This is an alternative to ProseMirror's `AllSelection`, which doesn’t work well
              // with many other commands.
              new state.Plugin({
                  key: new state.PluginKey('clearDocument'),
                  appendTransaction: (transactions, oldState, newState) => {
                      const docChanges = transactions.some(transaction => transaction.docChanged)
                          && !oldState.doc.eq(newState.doc);
                      if (!docChanges) {
                          return;
                      }
                      const { empty, from, to } = oldState.selection;
                      const allFrom = state.Selection.atStart(oldState.doc).from;
                      const allEnd = state.Selection.atEnd(oldState.doc).to;
                      const allWasSelected = from === allFrom && to === allEnd;
                      if (empty || !allWasSelected) {
                          return;
                      }
                      const isEmpty = newState.doc.textBetween(0, newState.doc.content.size, ' ', ' ').length === 0;
                      if (!isEmpty) {
                          return;
                      }
                      const tr = newState.tr;
                      const state$1 = createChainableState({
                          state: newState,
                          transaction: tr,
                      });
                      const { commands } = new CommandManager({
                          editor: this.editor,
                          state: state$1,
                      });
                      commands.clearNodes();
                      if (!tr.steps.length) {
                          return;
                      }
                      return tr;
                  },
              }),
          ];
      },
  });

  const Tabindex = Extension.create({
      name: 'tabindex',
      addProseMirrorPlugins() {
          return [
              new state.Plugin({
                  key: new state.PluginKey('tabindex'),
                  props: {
                      attributes: this.editor.isEditable ? { tabindex: '0' } : {},
                  },
              }),
          ];
      },
  });

  var index = /*#__PURE__*/Object.freeze({
    __proto__: null,
    ClipboardTextSerializer: ClipboardTextSerializer,
    Commands: Commands,
    Editable: Editable,
    FocusEvents: FocusEvents,
    Keymap: Keymap,
    Tabindex: Tabindex
  });

  class NodePos {
      constructor(pos, editor, isBlock = false, node = null) {
          this.currentNode = null;
          this.actualDepth = null;
          this.isBlock = isBlock;
          this.resolvedPos = pos;
          this.editor = editor;
          this.currentNode = node;
      }
      get name() {
          return this.node.type.name;
      }
      get node() {
          return this.currentNode || this.resolvedPos.node();
      }
      get element() {
          return this.editor.view.domAtPos(this.pos).node;
      }
      get depth() {
          var _a;
          return (_a = this.actualDepth) !== null && _a !== void 0 ? _a : this.resolvedPos.depth;
      }
      get pos() {
          return this.resolvedPos.pos;
      }
      get content() {
          return this.node.content;
      }
      set content(content) {
          let from = this.from;
          let to = this.to;
          if (this.isBlock) {
              if (this.content.size === 0) {
                  console.error(`You can’t set content on a block node. Tried to set content on ${this.name} at ${this.pos}`);
                  return;
              }
              from = this.from + 1;
              to = this.to - 1;
          }
          this.editor.commands.insertContentAt({ from, to }, content);
      }
      get attributes() {
          return this.node.attrs;
      }
      get textContent() {
          return this.node.textContent;
      }
      get size() {
          return this.node.nodeSize;
      }
      get from() {
          if (this.isBlock) {
              return this.pos;
          }
          return this.resolvedPos.start(this.resolvedPos.depth);
      }
      get range() {
          return {
              from: this.from,
              to: this.to,
          };
      }
      get to() {
          if (this.isBlock) {
              return this.pos + this.size;
          }
          return this.resolvedPos.end(this.resolvedPos.depth) + (this.node.isText ? 0 : 1);
      }
      get parent() {
          if (this.depth === 0) {
              return null;
          }
          const parentPos = this.resolvedPos.start(this.resolvedPos.depth - 1);
          const $pos = this.resolvedPos.doc.resolve(parentPos);
          return new NodePos($pos, this.editor);
      }
      get before() {
          let $pos = this.resolvedPos.doc.resolve(this.from - (this.isBlock ? 1 : 2));
          if ($pos.depth !== this.depth) {
              $pos = this.resolvedPos.doc.resolve(this.from - 3);
          }
          return new NodePos($pos, this.editor);
      }
      get after() {
          let $pos = this.resolvedPos.doc.resolve(this.to + (this.isBlock ? 2 : 1));
          if ($pos.depth !== this.depth) {
              $pos = this.resolvedPos.doc.resolve(this.to + 3);
          }
          return new NodePos($pos, this.editor);
      }
      get children() {
          const children = [];
          this.node.content.forEach((node, offset) => {
              const isBlock = node.isBlock && !node.isTextblock;
              const targetPos = this.pos + offset + 1;
              const $pos = this.resolvedPos.doc.resolve(targetPos);
              if (!isBlock && $pos.depth <= this.depth) {
                  return;
              }
              const childNodePos = new NodePos($pos, this.editor, isBlock, isBlock ? node : null);
              if (isBlock) {
                  childNodePos.actualDepth = this.depth + 1;
              }
              children.push(new NodePos($pos, this.editor, isBlock, isBlock ? node : null));
          });
          return children;
      }
      get firstChild() {
          return this.children[0] || null;
      }
      get lastChild() {
          const children = this.children;
          return children[children.length - 1] || null;
      }
      closest(selector, attributes = {}) {
          let node = null;
          let currentNode = this.parent;
          while (currentNode && !node) {
              if (currentNode.node.type.name === selector) {
                  if (Object.keys(attributes).length > 0) {
                      const nodeAttributes = currentNode.node.attrs;
                      const attrKeys = Object.keys(attributes);
                      for (let index = 0; index < attrKeys.length; index += 1) {
                          const key = attrKeys[index];
                          if (nodeAttributes[key] !== attributes[key]) {
                              break;
                          }
                      }
                  }
                  else {
                      node = currentNode;
                  }
              }
              currentNode = currentNode.parent;
          }
          return node;
      }
      querySelector(selector, attributes = {}) {
          return this.querySelectorAll(selector, attributes, true)[0] || null;
      }
      querySelectorAll(selector, attributes = {}, firstItemOnly = false) {
          let nodes = [];
          if (!this.children || this.children.length === 0) {
              return nodes;
          }
          const attrKeys = Object.keys(attributes);
          /**
           * Finds all children recursively that match the selector and attributes
           * If firstItemOnly is true, it will return the first item found
           */
          this.children.forEach(childPos => {
              // If we already found a node and we only want the first item, we dont need to keep going
              if (firstItemOnly && nodes.length > 0) {
                  return;
              }
              if (childPos.node.type.name === selector) {
                  const doesAllAttributesMatch = attrKeys.every(key => attributes[key] === childPos.node.attrs[key]);
                  if (doesAllAttributesMatch) {
                      nodes.push(childPos);
                  }
              }
              // If we already found a node and we only want the first item, we can stop here and skip the recursion
              if (firstItemOnly && nodes.length > 0) {
                  return;
              }
              nodes = nodes.concat(childPos.querySelectorAll(selector, attributes, firstItemOnly));
          });
          return nodes;
      }
      setAttribute(attributes) {
          const oldSelection = this.editor.state.selection;
          this.editor.chain().setTextSelection(this.from).updateAttributes(this.node.type.name, attributes).setTextSelection(oldSelection.from)
              .run();
      }
  }

  const style = `.ProseMirror {
  position: relative;
}

.ProseMirror {
  word-wrap: break-word;
  white-space: pre-wrap;
  white-space: break-spaces;
  -webkit-font-variant-ligatures: none;
  font-variant-ligatures: none;
  font-feature-settings: "liga" 0; /* the above doesn't seem to work in Edge */
}

.ProseMirror [contenteditable="false"] {
  white-space: normal;
}

.ProseMirror [contenteditable="false"] [contenteditable="true"] {
  white-space: pre-wrap;
}

.ProseMirror pre {
  white-space: pre-wrap;
}

img.ProseMirror-separator {
  display: inline !important;
  border: none !important;
  margin: 0 !important;
  width: 1px !important;
  height: 1px !important;
}

.ProseMirror-gapcursor {
  display: none;
  pointer-events: none;
  position: absolute;
  margin: 0;
}

.ProseMirror-gapcursor:after {
  content: "";
  display: block;
  position: absolute;
  top: -2px;
  width: 20px;
  border-top: 1px solid black;
  animation: ProseMirror-cursor-blink 1.1s steps(2, start) infinite;
}

@keyframes ProseMirror-cursor-blink {
  to {
    visibility: hidden;
  }
}

.ProseMirror-hideselection *::selection {
  background: transparent;
}

.ProseMirror-hideselection *::-moz-selection {
  background: transparent;
}

.ProseMirror-hideselection * {
  caret-color: transparent;
}

.ProseMirror-focused .ProseMirror-gapcursor {
  display: block;
}

.tippy-box[data-animation=fade][data-state=hidden] {
  opacity: 0
}`;

  function createStyleTag(style, nonce, suffix) {
      const tiptapStyleTag = document.querySelector(`style[data-tiptap-style${suffix ? `-${suffix}` : ''}]`);
      if (tiptapStyleTag !== null) {
          return tiptapStyleTag;
      }
      const styleNode = document.createElement('style');
      if (nonce) {
          styleNode.setAttribute('nonce', nonce);
      }
      styleNode.setAttribute(`data-tiptap-style${suffix ? `-${suffix}` : ''}`, '');
      styleNode.innerHTML = style;
      document.getElementsByTagName('head')[0].appendChild(styleNode);
      return styleNode;
  }

  class Editor extends EventEmitter {
      constructor(options = {}) {
          super();
          this.isFocused = false;
          this.extensionStorage = {};
          this.options = {
              element: document.createElement('div'),
              content: '',
              injectCSS: true,
              injectNonce: undefined,
              extensions: [],
              autofocus: false,
              editable: true,
              editorProps: {},
              parseOptions: {},
              coreExtensionOptions: {},
              enableInputRules: true,
              enablePasteRules: true,
              enableCoreExtensions: true,
              onBeforeCreate: () => null,
              onCreate: () => null,
              onUpdate: () => null,
              onSelectionUpdate: () => null,
              onTransaction: () => null,
              onFocus: () => null,
              onBlur: () => null,
              onDestroy: () => null,
          };
          this.isCapturingTransaction = false;
          this.capturedTransaction = null;
          this.setOptions(options);
          this.createExtensionManager();
          this.createCommandManager();
          this.createSchema();
          this.on('beforeCreate', this.options.onBeforeCreate);
          this.emit('beforeCreate', { editor: this });
          this.createView();
          this.injectCSS();
          this.on('create', this.options.onCreate);
          this.on('update', this.options.onUpdate);
          this.on('selectionUpdate', this.options.onSelectionUpdate);
          this.on('transaction', this.options.onTransaction);
          this.on('focus', this.options.onFocus);
          this.on('blur', this.options.onBlur);
          this.on('destroy', this.options.onDestroy);
          window.setTimeout(() => {
              if (this.isDestroyed) {
                  return;
              }
              this.commands.focus(this.options.autofocus);
              this.emit('create', { editor: this });
          }, 0);
      }
      /**
       * Returns the editor storage.
       */
      get storage() {
          return this.extensionStorage;
      }
      /**
       * An object of all registered commands.
       */
      get commands() {
          return this.commandManager.commands;
      }
      /**
       * Create a command chain to call multiple commands at once.
       */
      chain() {
          return this.commandManager.chain();
      }
      /**
       * Check if a command or a command chain can be executed. Without executing it.
       */
      can() {
          return this.commandManager.can();
      }
      /**
       * Inject CSS styles.
       */
      injectCSS() {
          if (this.options.injectCSS && document) {
              this.css = createStyleTag(style, this.options.injectNonce);
          }
      }
      /**
       * Update editor options.
       *
       * @param options A list of options
       */
      setOptions(options = {}) {
          this.options = {
              ...this.options,
              ...options,
          };
          if (!this.view || !this.state || this.isDestroyed) {
              return;
          }
          if (this.options.editorProps) {
              this.view.setProps(this.options.editorProps);
          }
          this.view.updateState(this.state);
      }
      /**
       * Update editable state of the editor.
       */
      setEditable(editable, emitUpdate = true) {
          this.setOptions({ editable });
          if (emitUpdate) {
              this.emit('update', { editor: this, transaction: this.state.tr });
          }
      }
      /**
       * Returns whether the editor is editable.
       */
      get isEditable() {
          // since plugins are applied after creating the view
          // `editable` is always `true` for one tick.
          // that’s why we also have to check for `options.editable`
          return this.options.editable && this.view && this.view.editable;
      }
      /**
       * Returns the editor state.
       */
      get state() {
          return this.view.state;
      }
      /**
       * Register a ProseMirror plugin.
       *
       * @param plugin A ProseMirror plugin
       * @param handlePlugins Control how to merge the plugin into the existing plugins.
       */
      registerPlugin(plugin, handlePlugins) {
          const plugins = isFunction(handlePlugins)
              ? handlePlugins(plugin, [...this.state.plugins])
              : [...this.state.plugins, plugin];
          const state = this.state.reconfigure({ plugins });
          this.view.updateState(state);
      }
      /**
       * Unregister a ProseMirror plugin.
       *
       * @param nameOrPluginKey The plugins name
       */
      unregisterPlugin(nameOrPluginKey) {
          if (this.isDestroyed) {
              return;
          }
          // @ts-ignore
          const name = typeof nameOrPluginKey === 'string' ? `${nameOrPluginKey}$` : nameOrPluginKey.key;
          const state = this.state.reconfigure({
              // @ts-ignore
              plugins: this.state.plugins.filter(plugin => !plugin.key.startsWith(name)),
          });
          this.view.updateState(state);
      }
      /**
       * Creates an extension manager.
       */
      createExtensionManager() {
          var _a, _b;
          const coreExtensions = this.options.enableCoreExtensions ? [
              Editable,
              ClipboardTextSerializer.configure({
                  blockSeparator: (_b = (_a = this.options.coreExtensionOptions) === null || _a === void 0 ? void 0 : _a.clipboardTextSerializer) === null || _b === void 0 ? void 0 : _b.blockSeparator,
              }),
              Commands,
              FocusEvents,
              Keymap,
              Tabindex,
          ] : [];
          const allExtensions = [...coreExtensions, ...this.options.extensions].filter(extension => {
              return ['extension', 'node', 'mark'].includes(extension === null || extension === void 0 ? void 0 : extension.type);
          });
          this.extensionManager = new ExtensionManager(allExtensions, this);
      }
      /**
       * Creates an command manager.
       */
      createCommandManager() {
          this.commandManager = new CommandManager({
              editor: this,
          });
      }
      /**
       * Creates a ProseMirror schema.
       */
      createSchema() {
          this.schema = this.extensionManager.schema;
      }
      /**
       * Creates a ProseMirror view.
       */
      createView() {
          const doc = createDocument(this.options.content, this.schema, this.options.parseOptions);
          const selection = resolveFocusPosition(doc, this.options.autofocus);
          this.view = new view.EditorView(this.options.element, {
              ...this.options.editorProps,
              dispatchTransaction: this.dispatchTransaction.bind(this),
              state: state.EditorState.create({
                  doc,
                  selection: selection || undefined,
              }),
          });
          // `editor.view` is not yet available at this time.
          // Therefore we will add all plugins and node views directly afterwards.
          const newState = this.state.reconfigure({
              plugins: this.extensionManager.plugins,
          });
          this.view.updateState(newState);
          this.createNodeViews();
          this.prependClass();
          // Let’s store the editor instance in the DOM element.
          // So we’ll have access to it for tests.
          const dom = this.view.dom;
          dom.editor = this;
      }
      /**
       * Creates all node views.
       */
      createNodeViews() {
          this.view.setProps({
              nodeViews: this.extensionManager.nodeViews,
          });
      }
      /**
       * Prepend class name to element.
       */
      prependClass() {
          this.view.dom.className = `tiptap ${this.view.dom.className}`;
      }
      captureTransaction(fn) {
          this.isCapturingTransaction = true;
          fn();
          this.isCapturingTransaction = false;
          const tr = this.capturedTransaction;
          this.capturedTransaction = null;
          return tr;
      }
      /**
       * The callback over which to send transactions (state updates) produced by the view.
       *
       * @param transaction An editor state transaction
       */
      dispatchTransaction(transaction) {
          // if the editor / the view of the editor was destroyed
          // the transaction should not be dispatched as there is no view anymore.
          if (this.view.isDestroyed) {
              return;
          }
          if (this.isCapturingTransaction) {
              if (!this.capturedTransaction) {
                  this.capturedTransaction = transaction;
                  return;
              }
              transaction.steps.forEach(step => { var _a; return (_a = this.capturedTransaction) === null || _a === void 0 ? void 0 : _a.step(step); });
              return;
          }
          const state = this.state.apply(transaction);
          const selectionHasChanged = !this.state.selection.eq(state.selection);
          this.view.updateState(state);
          this.emit('transaction', {
              editor: this,
              transaction,
          });
          if (selectionHasChanged) {
              this.emit('selectionUpdate', {
                  editor: this,
                  transaction,
              });
          }
          const focus = transaction.getMeta('focus');
          const blur = transaction.getMeta('blur');
          if (focus) {
              this.emit('focus', {
                  editor: this,
                  event: focus.event,
                  transaction,
              });
          }
          if (blur) {
              this.emit('blur', {
                  editor: this,
                  event: blur.event,
                  transaction,
              });
          }
          if (!transaction.docChanged || transaction.getMeta('preventUpdate')) {
              return;
          }
          this.emit('update', {
              editor: this,
              transaction,
          });
      }
      /**
       * Get attributes of the currently selected node or mark.
       */
      getAttributes(nameOrType) {
          return getAttributes(this.state, nameOrType);
      }
      isActive(nameOrAttributes, attributesOrUndefined) {
          const name = typeof nameOrAttributes === 'string' ? nameOrAttributes : null;
          const attributes = typeof nameOrAttributes === 'string' ? attributesOrUndefined : nameOrAttributes;
          return isActive(this.state, name, attributes);
      }
      /**
       * Get the document as JSON.
       */
      getJSON() {
          return this.state.doc.toJSON();
      }
      /**
       * Get the document as HTML.
       */
      getHTML() {
          return getHTMLFromFragment(this.state.doc.content, this.schema);
      }
      /**
       * Get the document as text.
       */
      getText(options) {
          const { blockSeparator = '\n\n', textSerializers = {} } = options || {};
          return getText(this.state.doc, {
              blockSeparator,
              textSerializers: {
                  ...getTextSerializersFromSchema(this.schema),
                  ...textSerializers,
              },
          });
      }
      /**
       * Check if there is no content.
       */
      get isEmpty() {
          return isNodeEmpty(this.state.doc);
      }
      /**
       * Get the number of characters for the current document.
       *
       * @deprecated
       */
      getCharacterCount() {
          console.warn('[tiptap warn]: "editor.getCharacterCount()" is deprecated. Please use "editor.storage.characterCount.characters()" instead.');
          return this.state.doc.content.size - 2;
      }
      /**
       * Destroy the editor.
       */
      destroy() {
          this.emit('destroy');
          if (this.view) {
              this.view.destroy();
          }
          this.removeAllListeners();
      }
      /**
       * Check if the editor is already destroyed.
       */
      get isDestroyed() {
          var _a;
          // @ts-ignore
          return !((_a = this.view) === null || _a === void 0 ? void 0 : _a.docView);
      }
      $node(selector, attributes) {
          var _a;
          return ((_a = this.$doc) === null || _a === void 0 ? void 0 : _a.querySelector(selector, attributes)) || null;
      }
      $nodes(selector, attributes) {
          var _a;
          return ((_a = this.$doc) === null || _a === void 0 ? void 0 : _a.querySelectorAll(selector, attributes)) || null;
      }
      $pos(pos) {
          const $pos = this.state.doc.resolve(pos);
          return new NodePos($pos, this);
      }
      get $doc() {
          return this.$pos(0);
      }
  }

  /**
   * Build an input rule that adds a mark when the
   * matched text is typed into it.
   * @see https://tiptap.dev/guide/custom-extensions/#input-rules
   */
  function markInputRule(config) {
      return new InputRule({
          find: config.find,
          handler: ({ state, range, match }) => {
              const attributes = callOrReturn(config.getAttributes, undefined, match);
              if (attributes === false || attributes === null) {
                  return null;
              }
              const { tr } = state;
              const captureGroup = match[match.length - 1];
              const fullMatch = match[0];
              if (captureGroup) {
                  const startSpaces = fullMatch.search(/\S/);
                  const textStart = range.from + fullMatch.indexOf(captureGroup);
                  const textEnd = textStart + captureGroup.length;
                  const excludedMarks = getMarksBetween(range.from, range.to, state.doc)
                      .filter(item => {
                      // @ts-ignore
                      const excluded = item.mark.type.excluded;
                      return excluded.find(type => type === config.type && type !== item.mark.type);
                  })
                      .filter(item => item.to > textStart);
                  if (excludedMarks.length) {
                      return null;
                  }
                  if (textEnd < range.to) {
                      tr.delete(textEnd, range.to);
                  }
                  if (textStart > range.from) {
                      tr.delete(range.from + startSpaces, textStart);
                  }
                  const markEnd = range.from + startSpaces + captureGroup.length;
                  tr.addMark(range.from + startSpaces, markEnd, config.type.create(attributes || {}));
                  tr.removeStoredMark(config.type);
              }
          },
      });
  }

  /**
   * Build an input rule that adds a node when the
   * matched text is typed into it.
   * @see https://tiptap.dev/guide/custom-extensions/#input-rules
   */
  function nodeInputRule(config) {
      return new InputRule({
          find: config.find,
          handler: ({ state, range, match }) => {
              const attributes = callOrReturn(config.getAttributes, undefined, match) || {};
              const { tr } = state;
              const start = range.from;
              let end = range.to;
              const newNode = config.type.create(attributes);
              if (match[1]) {
                  const offset = match[0].lastIndexOf(match[1]);
                  let matchStart = start + offset;
                  if (matchStart > end) {
                      matchStart = end;
                  }
                  else {
                      end = matchStart + match[1].length;
                  }
                  // insert last typed character
                  const lastChar = match[0][match[0].length - 1];
                  tr.insertText(lastChar, start + match[0].length - 1);
                  // insert node from input rule
                  tr.replaceWith(matchStart, end, newNode);
              }
              else if (match[0]) {
                  tr.insert(start - 1, config.type.create(attributes)).delete(tr.mapping.map(start), tr.mapping.map(end));
              }
              tr.scrollIntoView();
          },
      });
  }

  /**
   * Build an input rule that changes the type of a textblock when the
   * matched text is typed into it. When using a regular expresion you’ll
   * probably want the regexp to start with `^`, so that the pattern can
   * only occur at the start of a textblock.
   * @see https://tiptap.dev/guide/custom-extensions/#input-rules
   */
  function textblockTypeInputRule(config) {
      return new InputRule({
          find: config.find,
          handler: ({ state, range, match }) => {
              const $start = state.doc.resolve(range.from);
              const attributes = callOrReturn(config.getAttributes, undefined, match) || {};
              if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), config.type)) {
                  return null;
              }
              state.tr
                  .delete(range.from, range.to)
                  .setBlockType(range.from, range.from, config.type, attributes);
          },
      });
  }

  /**
   * Build an input rule that replaces text when the
   * matched text is typed into it.
   * @see https://tiptap.dev/guide/custom-extensions/#input-rules
   */
  function textInputRule(config) {
      return new InputRule({
          find: config.find,
          handler: ({ state, range, match }) => {
              let insert = config.replace;
              let start = range.from;
              const end = range.to;
              if (match[1]) {
                  const offset = match[0].lastIndexOf(match[1]);
                  insert += match[0].slice(offset + match[1].length);
                  start += offset;
                  const cutOff = start - end;
                  if (cutOff > 0) {
                      insert = match[0].slice(offset - cutOff, offset) + insert;
                      start = end;
                  }
              }
              state.tr.insertText(insert, start, end);
          },
      });
  }

  /**
   * Build an input rule for automatically wrapping a textblock when a
   * given string is typed. When using a regular expresion you’ll
   * probably want the regexp to start with `^`, so that the pattern can
   * only occur at the start of a textblock.
   *
   * `type` is the type of node to wrap in.
   *
   * By default, if there’s a node with the same type above the newly
   * wrapped node, the rule will try to join those
   * two nodes. You can pass a join predicate, which takes a regular
   * expression match and the node before the wrapped node, and can
   * return a boolean to indicate whether a join should happen.
   * @see https://tiptap.dev/guide/custom-extensions/#input-rules
   */
  function wrappingInputRule(config) {
      return new InputRule({
          find: config.find,
          handler: ({ state, range, match, chain, }) => {
              const attributes = callOrReturn(config.getAttributes, undefined, match) || {};
              const tr = state.tr.delete(range.from, range.to);
              const $start = tr.doc.resolve(range.from);
              const blockRange = $start.blockRange();
              const wrapping = blockRange && transform.findWrapping(blockRange, config.type, attributes);
              if (!wrapping) {
                  return null;
              }
              tr.wrap(blockRange, wrapping);
              if (config.keepMarks && config.editor) {
                  const { selection, storedMarks } = state;
                  const { splittableMarks } = config.editor.extensionManager;
                  const marks = storedMarks || (selection.$to.parentOffset && selection.$from.marks());
                  if (marks) {
                      const filteredMarks = marks.filter(mark => splittableMarks.includes(mark.type.name));
                      tr.ensureMarks(filteredMarks);
                  }
              }
              if (config.keepAttributes) {
                  /** If the nodeType is `bulletList` or `orderedList` set the `nodeType` as `listItem` */
                  const nodeType = config.type.name === 'bulletList' || config.type.name === 'orderedList' ? 'listItem' : 'taskList';
                  chain().updateAttributes(nodeType, attributes).run();
              }
              const before = tr.doc.resolve(range.from - 1).nodeBefore;
              if (before
                  && before.type === config.type
                  && transform.canJoin(tr.doc, range.from - 1)
                  && (!config.joinPredicate || config.joinPredicate(match, before))) {
                  tr.join(range.from - 1);
              }
          },
      });
  }

  /**
   * The Mark class is used to create custom mark extensions.
   * @see https://tiptap.dev/api/extensions#create-a-new-extension
   */
  class Mark {
      constructor(config = {}) {
          this.type = 'mark';
          this.name = 'mark';
          this.parent = null;
          this.child = null;
          this.config = {
              name: this.name,
              defaultOptions: {},
          };
          this.config = {
              ...this.config,
              ...config,
          };
          this.name = this.config.name;
          if (config.defaultOptions && Object.keys(config.defaultOptions).length > 0) {
              console.warn(`[tiptap warn]: BREAKING CHANGE: "defaultOptions" is deprecated. Please use "addOptions" instead. Found in extension: "${this.name}".`);
          }
          // TODO: remove `addOptions` fallback
          this.options = this.config.defaultOptions;
          if (this.config.addOptions) {
              this.options = callOrReturn(getExtensionField(this, 'addOptions', {
                  name: this.name,
              }));
          }
          this.storage = callOrReturn(getExtensionField(this, 'addStorage', {
              name: this.name,
              options: this.options,
          })) || {};
      }
      static create(config = {}) {
          return new Mark(config);
      }
      configure(options = {}) {
          // return a new instance so we can use the same extension
          // with different calls of `configure`
          const extension = this.extend();
          extension.options = mergeDeep(this.options, options);
          extension.storage = callOrReturn(getExtensionField(extension, 'addStorage', {
              name: extension.name,
              options: extension.options,
          }));
          return extension;
      }
      extend(extendedConfig = {}) {
          const extension = new Mark({ ...this.config, ...extendedConfig });
          extension.parent = this;
          this.child = extension;
          extension.name = extendedConfig.name ? extendedConfig.name : extension.parent.name;
          if (extendedConfig.defaultOptions) {
              console.warn(`[tiptap warn]: BREAKING CHANGE: "defaultOptions" is deprecated. Please use "addOptions" instead. Found in extension: "${extension.name}".`);
          }
          extension.options = callOrReturn(getExtensionField(extension, 'addOptions', {
              name: extension.name,
          }));
          extension.storage = callOrReturn(getExtensionField(extension, 'addStorage', {
              name: extension.name,
              options: extension.options,
          }));
          return extension;
      }
      static handleExit({ editor, mark }) {
          const { tr } = editor.state;
          const currentPos = editor.state.selection.$from;
          const isAtEnd = currentPos.pos === currentPos.end();
          if (isAtEnd) {
              const currentMarks = currentPos.marks();
              const isInMark = !!currentMarks.find(m => (m === null || m === void 0 ? void 0 : m.type.name) === mark.name);
              if (!isInMark) {
                  return false;
              }
              const removeMark = currentMarks.find(m => (m === null || m === void 0 ? void 0 : m.type.name) === mark.name);
              if (removeMark) {
                  tr.removeStoredMark(removeMark);
              }
              tr.insertText(' ', currentPos.pos);
              editor.view.dispatch(tr);
              return true;
          }
          return false;
      }
  }

  /**
   * The Node class is used to create custom node extensions.
   * @see https://tiptap.dev/api/extensions#create-a-new-extension
   */
  class Node {
      constructor(config = {}) {
          this.type = 'node';
          this.name = 'node';
          this.parent = null;
          this.child = null;
          this.config = {
              name: this.name,
              defaultOptions: {},
          };
          this.config = {
              ...this.config,
              ...config,
          };
          this.name = this.config.name;
          if (config.defaultOptions && Object.keys(config.defaultOptions).length > 0) {
              console.warn(`[tiptap warn]: BREAKING CHANGE: "defaultOptions" is deprecated. Please use "addOptions" instead. Found in extension: "${this.name}".`);
          }
          // TODO: remove `addOptions` fallback
          this.options = this.config.defaultOptions;
          if (this.config.addOptions) {
              this.options = callOrReturn(getExtensionField(this, 'addOptions', {
                  name: this.name,
              }));
          }
          this.storage = callOrReturn(getExtensionField(this, 'addStorage', {
              name: this.name,
              options: this.options,
          })) || {};
      }
      static create(config = {}) {
          return new Node(config);
      }
      configure(options = {}) {
          // return a new instance so we can use the same extension
          // with different calls of `configure`
          const extension = this.extend();
          extension.options = mergeDeep(this.options, options);
          extension.storage = callOrReturn(getExtensionField(extension, 'addStorage', {
              name: extension.name,
              options: extension.options,
          }));
          return extension;
      }
      extend(extendedConfig = {}) {
          const extension = new Node({ ...this.config, ...extendedConfig });
          extension.parent = this;
          this.child = extension;
          extension.name = extendedConfig.name ? extendedConfig.name : extension.parent.name;
          if (extendedConfig.defaultOptions) {
              console.warn(`[tiptap warn]: BREAKING CHANGE: "defaultOptions" is deprecated. Please use "addOptions" instead. Found in extension: "${extension.name}".`);
          }
          extension.options = callOrReturn(getExtensionField(extension, 'addOptions', {
              name: extension.name,
          }));
          extension.storage = callOrReturn(getExtensionField(extension, 'addStorage', {
              name: extension.name,
              options: extension.options,
          }));
          return extension;
      }
  }

  function isAndroid() {
      return navigator.platform === 'Android' || /android/i.test(navigator.userAgent);
  }

  /**
   * Node views are used to customize the rendered DOM structure of a node.
   * @see https://tiptap.dev/guide/node-views
   */
  class NodeView {
      constructor(component, props, options) {
          this.isDragging = false;
          this.component = component;
          this.editor = props.editor;
          this.options = {
              stopEvent: null,
              ignoreMutation: null,
              ...options,
          };
          this.extension = props.extension;
          this.node = props.node;
          this.decorations = props.decorations;
          this.getPos = props.getPos;
          this.mount();
      }
      mount() {
          // eslint-disable-next-line
          return;
      }
      get dom() {
          return this.editor.view.dom;
      }
      get contentDOM() {
          return null;
      }
      onDragStart(event) {
          var _a, _b, _c, _d, _e, _f, _g;
          const { view } = this.editor;
          const target = event.target;
          // get the drag handle element
          // `closest` is not available for text nodes so we may have to use its parent
          const dragHandle = target.nodeType === 3
              ? (_a = target.parentElement) === null || _a === void 0 ? void 0 : _a.closest('[data-drag-handle]')
              : target.closest('[data-drag-handle]');
          if (!this.dom || ((_b = this.contentDOM) === null || _b === void 0 ? void 0 : _b.contains(target)) || !dragHandle) {
              return;
          }
          let x = 0;
          let y = 0;
          // calculate offset for drag element if we use a different drag handle element
          if (this.dom !== dragHandle) {
              const domBox = this.dom.getBoundingClientRect();
              const handleBox = dragHandle.getBoundingClientRect();
              // In React, we have to go through nativeEvent to reach offsetX/offsetY.
              const offsetX = (_c = event.offsetX) !== null && _c !== void 0 ? _c : (_d = event.nativeEvent) === null || _d === void 0 ? void 0 : _d.offsetX;
              const offsetY = (_e = event.offsetY) !== null && _e !== void 0 ? _e : (_f = event.nativeEvent) === null || _f === void 0 ? void 0 : _f.offsetY;
              x = handleBox.x - domBox.x + offsetX;
              y = handleBox.y - domBox.y + offsetY;
          }
          (_g = event.dataTransfer) === null || _g === void 0 ? void 0 : _g.setDragImage(this.dom, x, y);
          // we need to tell ProseMirror that we want to move the whole node
          // so we create a NodeSelection
          const selection = state.NodeSelection.create(view.state.doc, this.getPos());
          const transaction = view.state.tr.setSelection(selection);
          view.dispatch(transaction);
      }
      stopEvent(event) {
          var _a;
          if (!this.dom) {
              return false;
          }
          if (typeof this.options.stopEvent === 'function') {
              return this.options.stopEvent({ event });
          }
          const target = event.target;
          const isInElement = this.dom.contains(target) && !((_a = this.contentDOM) === null || _a === void 0 ? void 0 : _a.contains(target));
          // any event from child nodes should be handled by ProseMirror
          if (!isInElement) {
              return false;
          }
          const isDragEvent = event.type.startsWith('drag');
          const isDropEvent = event.type === 'drop';
          const isInput = ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable;
          // any input event within node views should be ignored by ProseMirror
          if (isInput && !isDropEvent && !isDragEvent) {
              return true;
          }
          const { isEditable } = this.editor;
          const { isDragging } = this;
          const isDraggable = !!this.node.type.spec.draggable;
          const isSelectable = state.NodeSelection.isSelectable(this.node);
          const isCopyEvent = event.type === 'copy';
          const isPasteEvent = event.type === 'paste';
          const isCutEvent = event.type === 'cut';
          const isClickEvent = event.type === 'mousedown';
          // ProseMirror tries to drag selectable nodes
          // even if `draggable` is set to `false`
          // this fix prevents that
          if (!isDraggable && isSelectable && isDragEvent) {
              event.preventDefault();
          }
          if (isDraggable && isDragEvent && !isDragging) {
              event.preventDefault();
              return false;
          }
          // we have to store that dragging started
          if (isDraggable && isEditable && !isDragging && isClickEvent) {
              const dragHandle = target.closest('[data-drag-handle]');
              const isValidDragHandle = dragHandle && (this.dom === dragHandle || this.dom.contains(dragHandle));
              if (isValidDragHandle) {
                  this.isDragging = true;
                  document.addEventListener('dragend', () => {
                      this.isDragging = false;
                  }, { once: true });
                  document.addEventListener('drop', () => {
                      this.isDragging = false;
                  }, { once: true });
                  document.addEventListener('mouseup', () => {
                      this.isDragging = false;
                  }, { once: true });
              }
          }
          // these events are handled by prosemirror
          if (isDragging
              || isDropEvent
              || isCopyEvent
              || isPasteEvent
              || isCutEvent
              || (isClickEvent && isSelectable)) {
              return false;
          }
          return true;
      }
      ignoreMutation(mutation) {
          if (!this.dom || !this.contentDOM) {
              return true;
          }
          if (typeof this.options.ignoreMutation === 'function') {
              return this.options.ignoreMutation({ mutation });
          }
          // a leaf/atom node is like a black box for ProseMirror
          // and should be fully handled by the node view
          if (this.node.isLeaf || this.node.isAtom) {
              return true;
          }
          // ProseMirror should handle any selections
          if (mutation.type === 'selection') {
              return false;
          }
          // try to prevent a bug on iOS and Android that will break node views on enter
          // this is because ProseMirror can’t preventDispatch on enter
          // this will lead to a re-render of the node view on enter
          // see: https://github.com/ueberdosis/tiptap/issues/1214
          // see: https://github.com/ueberdosis/tiptap/issues/2534
          if (this.dom.contains(mutation.target)
              && mutation.type === 'childList'
              && (isiOS() || isAndroid())
              && this.editor.isFocused) {
              const changedNodes = [
                  ...Array.from(mutation.addedNodes),
                  ...Array.from(mutation.removedNodes),
              ];
              // we’ll check if every changed node is contentEditable
              // to make sure it’s probably mutated by ProseMirror
              if (changedNodes.every(node => node.isContentEditable)) {
                  return false;
              }
          }
          // we will allow mutation contentDOM with attributes
          // so we can for example adding classes within our node view
          if (this.contentDOM === mutation.target && mutation.type === 'attributes') {
              return true;
          }
          // ProseMirror should handle any changes within contentDOM
          if (this.contentDOM.contains(mutation.target)) {
              return false;
          }
          return true;
      }
      updateAttributes(attributes) {
          this.editor.commands.command(({ tr }) => {
              const pos = this.getPos();
              tr.setNodeMarkup(pos, undefined, {
                  ...this.node.attrs,
                  ...attributes,
              });
              return true;
          });
      }
      deleteNode() {
          const from = this.getPos();
          const to = from + this.node.nodeSize;
          this.editor.commands.deleteRange({ from, to });
      }
  }

  /**
   * Build an paste rule that adds a mark when the
   * matched text is pasted into it.
   * @see https://tiptap.dev/guide/custom-extensions/#paste-rules
   */
  function markPasteRule(config) {
      return new PasteRule({
          find: config.find,
          handler: ({ state, range, match, pasteEvent, }) => {
              const attributes = callOrReturn(config.getAttributes, undefined, match, pasteEvent);
              if (attributes === false || attributes === null) {
                  return null;
              }
              const { tr } = state;
              const captureGroup = match[match.length - 1];
              const fullMatch = match[0];
              let markEnd = range.to;
              if (captureGroup) {
                  const startSpaces = fullMatch.search(/\S/);
                  const textStart = range.from + fullMatch.indexOf(captureGroup);
                  const textEnd = textStart + captureGroup.length;
                  const excludedMarks = getMarksBetween(range.from, range.to, state.doc)
                      .filter(item => {
                      // @ts-ignore
                      const excluded = item.mark.type.excluded;
                      return excluded.find(type => type === config.type && type !== item.mark.type);
                  })
                      .filter(item => item.to > textStart);
                  if (excludedMarks.length) {
                      return null;
                  }
                  if (textEnd < range.to) {
                      tr.delete(textEnd, range.to);
                  }
                  if (textStart > range.from) {
                      tr.delete(range.from + startSpaces, textStart);
                  }
                  markEnd = range.from + startSpaces + captureGroup.length;
                  tr.addMark(range.from + startSpaces, markEnd, config.type.create(attributes || {}));
                  tr.removeStoredMark(config.type);
              }
          },
      });
  }

  // source: https://stackoverflow.com/a/6969486
  function escapeForRegEx(string) {
      return string.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  }

  function isString(value) {
      return typeof value === 'string';
  }

  /**
   * Build an paste rule that adds a node when the
   * matched text is pasted into it.
   * @see https://tiptap.dev/guide/custom-extensions/#paste-rules
   */
  function nodePasteRule(config) {
      return new PasteRule({
          find: config.find,
          handler({ match, chain, range, pasteEvent, }) {
              const attributes = callOrReturn(config.getAttributes, undefined, match, pasteEvent);
              if (attributes === false || attributes === null) {
                  return null;
              }
              if (match.input) {
                  chain().deleteRange(range).insertContentAt(range.from, {
                      type: config.type.name,
                      attrs: attributes,
                  });
              }
          },
      });
  }

  /**
   * Build an paste rule that replaces text when the
   * matched text is pasted into it.
   * @see https://tiptap.dev/guide/custom-extensions/#paste-rules
   */
  function textPasteRule(config) {
      return new PasteRule({
          find: config.find,
          handler: ({ state, range, match }) => {
              let insert = config.replace;
              let start = range.from;
              const end = range.to;
              if (match[1]) {
                  const offset = match[0].lastIndexOf(match[1]);
                  insert += match[0].slice(offset + match[1].length);
                  start += offset;
                  const cutOff = start - end;
                  if (cutOff > 0) {
                      insert = match[0].slice(offset - cutOff, offset) + insert;
                      start = end;
                  }
              }
              state.tr.insertText(insert, start, end);
          },
      });
  }

  class Tracker {
      constructor(transaction) {
          this.transaction = transaction;
          this.currentStep = this.transaction.steps.length;
      }
      map(position) {
          let deleted = false;
          const mappedPosition = this.transaction.steps
              .slice(this.currentStep)
              .reduce((newPosition, step) => {
              const mapResult = step.getMap().mapResult(newPosition);
              if (mapResult.deleted) {
                  deleted = true;
              }
              return mapResult.pos;
          }, position);
          return {
              position: mappedPosition,
              deleted,
          };
      }
  }

  exports.CommandManager = CommandManager;
  exports.Editor = Editor;
  exports.Extension = Extension;
  exports.InputRule = InputRule;
  exports.Mark = Mark;
  exports.Node = Node;
  exports.NodePos = NodePos;
  exports.NodeView = NodeView;
  exports.PasteRule = PasteRule;
  exports.Tracker = Tracker;
  exports.callOrReturn = callOrReturn;
  exports.combineTransactionSteps = combineTransactionSteps;
  exports.createChainableState = createChainableState;
  exports.createDocument = createDocument;
  exports.createNodeFromContent = createNodeFromContent;
  exports.createStyleTag = createStyleTag;
  exports.defaultBlockAt = defaultBlockAt;
  exports.deleteProps = deleteProps;
  exports.elementFromString = elementFromString;
  exports.escapeForRegEx = escapeForRegEx;
  exports.extensions = index;
  exports.findChildren = findChildren;
  exports.findChildrenInRange = findChildrenInRange;
  exports.findDuplicates = findDuplicates;
  exports.findParentNode = findParentNode;
  exports.findParentNodeClosestToPos = findParentNodeClosestToPos;
  exports.fromString = fromString;
  exports.generateHTML = generateHTML;
  exports.generateJSON = generateJSON;
  exports.generateText = generateText;
  exports.getAttributes = getAttributes;
  exports.getAttributesFromExtensions = getAttributesFromExtensions;
  exports.getChangedRanges = getChangedRanges;
  exports.getDebugJSON = getDebugJSON;
  exports.getExtensionField = getExtensionField;
  exports.getHTMLFromFragment = getHTMLFromFragment;
  exports.getMarkAttributes = getMarkAttributes;
  exports.getMarkRange = getMarkRange;
  exports.getMarkType = getMarkType;
  exports.getMarksBetween = getMarksBetween;
  exports.getNodeAtPosition = getNodeAtPosition;
  exports.getNodeAttributes = getNodeAttributes;
  exports.getNodeType = getNodeType;
  exports.getRenderedAttributes = getRenderedAttributes;
  exports.getSchema = getSchema;
  exports.getSchemaByResolvedExtensions = getSchemaByResolvedExtensions;
  exports.getSchemaTypeByName = getSchemaTypeByName;
  exports.getSchemaTypeNameByName = getSchemaTypeNameByName;
  exports.getSplittedAttributes = getSplittedAttributes;
  exports.getText = getText;
  exports.getTextBetween = getTextBetween;
  exports.getTextContentFromNodes = getTextContentFromNodes;
  exports.getTextSerializersFromSchema = getTextSerializersFromSchema;
  exports.injectExtensionAttributesToParseRule = injectExtensionAttributesToParseRule;
  exports.inputRulesPlugin = inputRulesPlugin;
  exports.isActive = isActive;
  exports.isAtEndOfNode = isAtEndOfNode;
  exports.isAtStartOfNode = isAtStartOfNode;
  exports.isEmptyObject = isEmptyObject;
  exports.isExtensionRulesEnabled = isExtensionRulesEnabled;
  exports.isFunction = isFunction;
  exports.isList = isList;
  exports.isMacOS = isMacOS;
  exports.isMarkActive = isMarkActive;
  exports.isNodeActive = isNodeActive;
  exports.isNodeEmpty = isNodeEmpty;
  exports.isNodeSelection = isNodeSelection;
  exports.isNumber = isNumber;
  exports.isPlainObject = isPlainObject;
  exports.isRegExp = isRegExp;
  exports.isString = isString;
  exports.isTextSelection = isTextSelection;
  exports.isiOS = isiOS;
  exports.markInputRule = markInputRule;
  exports.markPasteRule = markPasteRule;
  exports.mergeAttributes = mergeAttributes;
  exports.mergeDeep = mergeDeep;
  exports.minMax = minMax;
  exports.nodeInputRule = nodeInputRule;
  exports.nodePasteRule = nodePasteRule;
  exports.objectIncludes = objectIncludes;
  exports.pasteRulesPlugin = pasteRulesPlugin;
  exports.posToDOMRect = posToDOMRect;
  exports.removeDuplicates = removeDuplicates;
  exports.resolveFocusPosition = resolveFocusPosition;
  exports.selectionToInsertionEnd = selectionToInsertionEnd;
  exports.splitExtensions = splitExtensions;
  exports.textInputRule = textInputRule;
  exports.textPasteRule = textPasteRule;
  exports.textblockTypeInputRule = textblockTypeInputRule;
  exports.wrappingInputRule = wrappingInputRule;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=index.umd.js.map


  // === Tiptap Starter Kit ===
  (function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tiptap/core'), require('@tiptap/extension-blockquote'), require('@tiptap/extension-bold'), require('@tiptap/extension-bullet-list'), require('@tiptap/extension-code'), require('@tiptap/extension-code-block'), require('@tiptap/extension-document'), require('@tiptap/extension-dropcursor'), require('@tiptap/extension-gapcursor'), require('@tiptap/extension-hard-break'), require('@tiptap/extension-heading'), require('@tiptap/extension-history'), require('@tiptap/extension-horizontal-rule'), require('@tiptap/extension-italic'), require('@tiptap/extension-list-item'), require('@tiptap/extension-ordered-list'), require('@tiptap/extension-paragraph'), require('@tiptap/extension-strike'), require('@tiptap/extension-text')) :
  typeof define === 'function' && define.amd ? define(['exports', '@tiptap/core', '@tiptap/extension-blockquote', '@tiptap/extension-bold', '@tiptap/extension-bullet-list', '@tiptap/extension-code', '@tiptap/extension-code-block', '@tiptap/extension-document', '@tiptap/extension-dropcursor', '@tiptap/extension-gapcursor', '@tiptap/extension-hard-break', '@tiptap/extension-heading', '@tiptap/extension-history', '@tiptap/extension-horizontal-rule', '@tiptap/extension-italic', '@tiptap/extension-list-item', '@tiptap/extension-ordered-list', '@tiptap/extension-paragraph', '@tiptap/extension-strike', '@tiptap/extension-text'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["@tiptap/starter-kit"] = {}, global.core, global.extensionBlockquote, global.extensionBold, global.extensionBulletList, global.extensionCode, global.extensionCodeBlock, global.extensionDocument, global.extensionDropcursor, global.extensionGapcursor, global.extensionHardBreak, global.extensionHeading, global.extensionHistory, global.extensionHorizontalRule, global.extensionItalic, global.extensionListItem, global.extensionOrderedList, global.extensionParagraph, global.extensionStrike, global.extensionText));
})(this, (function (exports, core, extensionBlockquote, extensionBold, extensionBulletList, extensionCode, extensionCodeBlock, extensionDocument, extensionDropcursor, extensionGapcursor, extensionHardBreak, extensionHeading, extensionHistory, extensionHorizontalRule, extensionItalic, extensionListItem, extensionOrderedList, extensionParagraph, extensionStrike, extensionText) { 'use strict';

  /**
   * The starter kit is a collection of essential editor extensions.
   *
   * It’s a good starting point for building your own editor.
   */
  const StarterKit = core.Extension.create({
      name: 'starterKit',
      addExtensions() {
          var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
          const extensions = [];
          if (this.options.blockquote !== false) {
              extensions.push(extensionBlockquote.Blockquote.configure((_a = this.options) === null || _a === void 0 ? void 0 : _a.blockquote));
          }
          if (this.options.bold !== false) {
              extensions.push(extensionBold.Bold.configure((_b = this.options) === null || _b === void 0 ? void 0 : _b.bold));
          }
          if (this.options.bulletList !== false) {
              extensions.push(extensionBulletList.BulletList.configure((_c = this.options) === null || _c === void 0 ? void 0 : _c.bulletList));
          }
          if (this.options.code !== false) {
              extensions.push(extensionCode.Code.configure((_d = this.options) === null || _d === void 0 ? void 0 : _d.code));
          }
          if (this.options.codeBlock !== false) {
              extensions.push(extensionCodeBlock.CodeBlock.configure((_e = this.options) === null || _e === void 0 ? void 0 : _e.codeBlock));
          }
          if (this.options.document !== false) {
              extensions.push(extensionDocument.Document.configure((_f = this.options) === null || _f === void 0 ? void 0 : _f.document));
          }
          if (this.options.dropcursor !== false) {
              extensions.push(extensionDropcursor.Dropcursor.configure((_g = this.options) === null || _g === void 0 ? void 0 : _g.dropcursor));
          }
          if (this.options.gapcursor !== false) {
              extensions.push(extensionGapcursor.Gapcursor.configure((_h = this.options) === null || _h === void 0 ? void 0 : _h.gapcursor));
          }
          if (this.options.hardBreak !== false) {
              extensions.push(extensionHardBreak.HardBreak.configure((_j = this.options) === null || _j === void 0 ? void 0 : _j.hardBreak));
          }
          if (this.options.heading !== false) {
              extensions.push(extensionHeading.Heading.configure((_k = this.options) === null || _k === void 0 ? void 0 : _k.heading));
          }
          if (this.options.history !== false) {
              extensions.push(extensionHistory.History.configure((_l = this.options) === null || _l === void 0 ? void 0 : _l.history));
          }
          if (this.options.horizontalRule !== false) {
              extensions.push(extensionHorizontalRule.HorizontalRule.configure((_m = this.options) === null || _m === void 0 ? void 0 : _m.horizontalRule));
          }
          if (this.options.italic !== false) {
              extensions.push(extensionItalic.Italic.configure((_o = this.options) === null || _o === void 0 ? void 0 : _o.italic));
          }
          if (this.options.listItem !== false) {
              extensions.push(extensionListItem.ListItem.configure((_p = this.options) === null || _p === void 0 ? void 0 : _p.listItem));
          }
          if (this.options.orderedList !== false) {
              extensions.push(extensionOrderedList.OrderedList.configure((_q = this.options) === null || _q === void 0 ? void 0 : _q.orderedList));
          }
          if (this.options.paragraph !== false) {
              extensions.push(extensionParagraph.Paragraph.configure((_r = this.options) === null || _r === void 0 ? void 0 : _r.paragraph));
          }
          if (this.options.strike !== false) {
              extensions.push(extensionStrike.Strike.configure((_s = this.options) === null || _s === void 0 ? void 0 : _s.strike));
          }
          if (this.options.text !== false) {
              extensions.push(extensionText.Text.configure((_t = this.options) === null || _t === void 0 ? void 0 : _t.text));
          }
          return extensions;
      },
  });

  exports.StarterKit = StarterKit;
  exports["default"] = StarterKit;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=index.umd.js.map


  // === Tiptap Extension Placeholder ===
  (function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tiptap/core'), require('@tiptap/pm/state'), require('@tiptap/pm/view')) :
  typeof define === 'function' && define.amd ? define(['exports', '@tiptap/core', '@tiptap/pm/state', '@tiptap/pm/view'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["@tiptap/extension-placeholder"] = {}, global.core, global.state, global.view));
})(this, (function (exports, core, state, view) { 'use strict';

  /**
   * This extension allows you to add a placeholder to your editor.
   * A placeholder is a text that appears when the editor or a node is empty.
   * @see https://www.tiptap.dev/api/extensions/placeholder
   */
  const Placeholder = core.Extension.create({
      name: 'placeholder',
      addOptions() {
          return {
              emptyEditorClass: 'is-editor-empty',
              emptyNodeClass: 'is-empty',
              placeholder: 'Write something …',
              showOnlyWhenEditable: true,
              considerAnyAsEmpty: false,
              showOnlyCurrent: true,
              includeChildren: false,
          };
      },
      addProseMirrorPlugins() {
          return [
              new state.Plugin({
                  key: new state.PluginKey('placeholder'),
                  props: {
                      decorations: ({ doc, selection }) => {
                          var _a;
                          const active = this.editor.isEditable || !this.options.showOnlyWhenEditable;
                          const { anchor } = selection;
                          const decorations = [];
                          if (!active) {
                              return null;
                          }
                          // only calculate isEmpty once due to its performance impacts (see issue #3360)
                          const { firstChild } = doc.content;
                          const isLeaf = firstChild && firstChild.type.isLeaf;
                          const isAtom = firstChild && firstChild.isAtom;
                          const isValidNode = this.options.considerAnyAsEmpty
                              ? true
                              : firstChild && firstChild.type.name === ((_a = doc.type.contentMatch.defaultType) === null || _a === void 0 ? void 0 : _a.name);
                          const isEmptyDoc = doc.content.childCount <= 1
                              && firstChild
                              && isValidNode
                              && (firstChild.nodeSize <= 2 && (!isLeaf || !isAtom));
                          doc.descendants((node, pos) => {
                              const hasAnchor = anchor >= pos && anchor <= pos + node.nodeSize;
                              const isEmpty = !node.isLeaf && !node.childCount;
                              if ((hasAnchor || !this.options.showOnlyCurrent) && isEmpty) {
                                  const classes = [this.options.emptyNodeClass];
                                  if (isEmptyDoc) {
                                      classes.push(this.options.emptyEditorClass);
                                  }
                                  const decoration = view.Decoration.node(pos, pos + node.nodeSize, {
                                      class: classes.join(' '),
                                      'data-placeholder': typeof this.options.placeholder === 'function'
                                          ? this.options.placeholder({
                                              editor: this.editor,
                                              node,
                                              pos,
                                              hasAnchor,
                                          })
                                          : this.options.placeholder,
                                  });
                                  decorations.push(decoration);
                              }
                              return this.options.includeChildren;
                          });
                          return view.DecorationSet.create(doc, decorations);
                      },
                  },
              }),
          ];
      },
  });

  exports.Placeholder = Placeholder;
  exports["default"] = Placeholder;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=index.umd.js.map



  // Инициализация после загрузки всех модулей
  setTimeout(function() {
    try {
      var core = global['@tiptap/core'];
      var starterKit = global['@tiptap/starter-kit'];
      var placeholder = global['@tiptap/extension-placeholder'];

      console.log('Tiptap core loaded:', !!core);
      console.log('StarterKit loaded:', !!starterKit);
      console.log('Placeholder loaded:', !!placeholder);

      // Экспортируем в window.Tiptap
      global.Tiptap = {
        Editor: core && core.Editor,
        Node: core && core.Node,
        Mark: core && core.Mark,
        Extension: core && core.Extension,
        mergeAttributes: core && core.mergeAttributes,
        findParentNode: core && core.findParentNode,
        findParentNodeClosestToPos: core && core.findParentNodeClosestToPos,
        findChildren: core && core.findChildren,
        findChildrenInRange: core && core.findChildrenInRange,
        findParentNodeOfType: core && core.findParentNodeOfType,
        isActive: core && core.isActive,
        isNodeActive: core && core.isNodeActive,
        isMarkActive: core && core.isMarkActive,
        resolveFocusPosition: core && core.resolveFocusPosition,
        Plugin: core && core.Plugin,
        PluginKey: core && core.PluginKey,
        Fragment: core && core.Fragment,
        Slice: core && core.Slice,
        Schema: core && core.Schema,
        NodeType: core && core.NodeType,
        MarkType: core && core.MarkType,
        Step: core && core.Step,
        Transform: core && core.Transform,
        EditorState: core && core.EditorState,
        TextSelection: core && core.TextSelection,
        NodeSelection: core && core.NodeSelection,
        AllSelection: core && core.AllSelection,
        Transaction: core && core.Transaction,
        EditorView: core && core.EditorView,
        Decoration: core && core.Decoration,
        DecorationSet: core && core.DecorationSet,
        StarterKit: starterKit && starterKit.StarterKit,
        Placeholder: placeholder && placeholder.Placeholder
      };

      console.log('Tiptap успешно инициализирован в window.Tiptap');
      console.log('Editor доступен:', !!global.Tiptap.Editor);
      
      // Событие готовности
      if (typeof document !== 'undefined') {
        var event = new CustomEvent('tiptap-ready', { detail: global.Tiptap });
        document.dispatchEvent(event);
      }
      
    } catch (e) {
      console.error('Критическая ошибка инициализации Tiptap:', e);
      console.error('Stack:', e.stack);
    }
  }, 100);

})(typeof window !== 'undefined' ? window : this);
