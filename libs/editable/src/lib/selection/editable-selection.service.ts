import { Injectable, OnDestroy } from '@angular/core';
import { wmDocument, wmNodeType, wmIndentType, wmTextStyle, wmAlignType } from '../model';
import { EditableDoc, EditableText, EditableTable, EditableRow, EditableCell } from '../model';
import { EditableContent } from '../model/editable-content';
import { timeInterval, map, filter } from 'rxjs/operators';
import { Subject, Subscription } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
/** Virtual document selection mapping browser range selection to the internal document data tree */
export class EditableSelection implements OnDestroy {

  private root: EditableDoc;
  private modified = false;

  public start: EditableContent;
  public startOfs: number;
  public end: EditableContent;
  public endOfs: number;

  constructor() { /*this.enableHistory(2000, 128);*/ }
  ngOnDestroy() { this.clearHistory(); }

  public attach(document: EditableDoc): EditableSelection { 
    return (this.root = document), this; 
  }
  /** Returns true on valid selection */
  get valid(): boolean { return !!this.start && !!this.end; }
  /** Returns true when the selection belongs within a single text node */
  get single(): boolean { return this.valid && (this.start === this.end); }
  /** Returns true when the selection spread across moltiple text nodes */
  get multi(): boolean { return !this.single; }
  /** Returns true when the selection includes the whole nodes */
  get whole(): boolean { return this.valid && (this.startOfs === 0) && (this.endOfs === this.end.length); }
  /** Returns true when the selection falls in trhe middle of text nodes */
  get partial(): boolean { return !this.whole; }
  /** Returns true when the selection is collpased in a cursor */
  get collapsed(): boolean { return this.single && (this.startOfs === this.endOfs);}
  /** Returns true then the selection fully belongs to a single container  */
  get contained(): boolean { return this.single || this.valid && this.start.container === this.end.container; }
  /** Returns true whenever the selection has been modified */
  get marked(): boolean { return this.modified; }

  public mark(modified = true): EditableSelection {
    this.modified = this.valid && modified;
    return this;
  }

  private setStart(node: EditableContent, ofs: number) {
    this.start = node;
    this.startOfs = (!!node && ofs < 0) ? node.length : ofs;
    this.modified = true;
  }

  private setEnd(node: EditableContent, ofs: number) {
    this.end = node;
    this.endOfs = (!!node && ofs < 0) ? node.length : ofs;
    this.modified = true;
  }
  /** Sets the selection range */
  public set(start: EditableContent, startOfs: number, end: EditableContent, endOfs: number): EditableSelection {
    this.setStart(start, startOfs);
    this.setEnd(end, endOfs);
    return this;
  }
  /** Collapses the selection to a cursor at the specified position */
  public setCursor(node: EditableContent, ofs: number): EditableSelection {
    return this.set(node, ofs, node, ofs);
  }
  /** Resets the selection as a cursor position at the very beginning of the document tree */
  public reset(): EditableSelection {
    return this.setCursor(this.root.firstDescendant() as any, 0);
  }
  /** 
   * Collapses the curernt selection to a cursor
   * @param end (optional) when true, collapses the cursor to the end edge of the selection.
   * It collapses to the start edge otherwise.
   */
  public collapse(end?: boolean): EditableSelection {
    return !!end ? this.setCursor(this.end, this.endOfs) : this.setCursor(this.start, this.startOfs);
  }
  /** Moves the selection start and end points by the specified offsets */
  public move(deltaStart: number, deltaEnd?: number): EditableSelection {
    // Skips on invalid selection
    if(!this.valid) { return this; }
    // Move the selection points
    const start = this.start.move(this.startOfs + deltaStart);
    const end = (deltaEnd === undefined) ? start : this.end.move(this.endOfs + deltaEnd);
    // Update the selection
    return this.set(start[0], start[1], end[0], end[1]);
  }
  /** Jumps to the previous text node skipping non text ones*/
  private previous(node: EditableContent, traverse: boolean = false): EditableContent {

    let prev = node.previous(traverse) as any;
    while(!!prev && !(prev instanceof EditableText)) { prev = prev.previous(traverse); }
    return prev;
  }
  /** Jumps to the next text node skipping non text ones*/
  private next(node: EditableContent, traverse: boolean = false): EditableContent {

    let next = node.next(traverse) as any;
    while(!!next && !(next instanceof EditableText)) { next = next.next(traverse); }
    return next;
  }
  /** Saves the current selection into the document data to be eventually restored by calling @see restore() */
  public save(document: EditableDoc): EditableDoc {
    // Skips on invalid selection
    if(!document || !this.valid) { return document; }
    // Computes the absolute start offset
    const start = this.start.offset;
    // Saves the selection range in the root data
    document.data.range = [
      start + this.startOfs, 
      (this.single ? start : this.end.offset) + this.endOfs
    ];
    return document;
  }
  /** Restores the selection range from the documenta data. @see save() */
  public restore(document: EditableDoc): EditableSelection {
    // Gets the range from the root data
    const range = !!document && document.data.range;
    // Updates the selection to reflect the absolute range
    return !!range ? this.reset().move(range[0], range[0] !== range[1] ? range[1] : undefined) : this;
  }
  /** Returns true whenever the start node/offset comes after the end ones */
  public get reversed(): boolean {
    if(!this.valid) { return false; }
    return this.start === this.end && this.startOfs > this.endOfs || this.start.compare(this.end) > 0;
  }
  /** Sort the start/end selection nodes, so, to make sure start comes always first */
  public sort(): EditableSelection {
    // Compares the points' position
    if(this.reversed) {

      const node = this.start;
      this.start = this.end;
      this.end = node;

      const ofs = this.startOfs;
      this.startOfs = this.endOfs;
      this.endOfs = ofs;
    }    
    return this;
  }
  /** Helper function to loop on all the text nodes within the selection */
  private nodes(callbackfn: (node: EditableContent) => void): EditableSelection {
    // Skips on invalid selection
    if(!this.valid || !callbackfn) { return this; }
    // Loops on the editable whithin the selection
    let node = this.start;
    while(!!node && node.compare(this.end) <= 0) {
      // Callback on the container
      callbackfn.call(this, node);
      // Gets the next text node
      node = this.next(node, true);
    }
    return this;
  }
  /** Helper function to loop on all the containers within the selection */
  private containers(callbackfn: (container: EditableContent) => void): EditableSelection {
    // Skips on invalid selection
    if(!this.valid || !callbackfn) { return this; }
    // Loops on the editable whithin the selection
    let container = this.start.container;
    while(!!container && container.compare(this.end) < 0) {
      // Callback on the container
      callbackfn.call(this, container);
      // Makes sure to skip structural node levels
      const next = container.lastChild().next();
      // Gets the next container
      container = !!next ? next.container : null;
    }
    return this;
  }
  /** Makes sure the selection falls within the inner nodes when on the edges.  */ 
  public trim(): EditableSelection {
    // Skips on invalid selection
    if(!this.valid || this.collapsed) { return this; }
    // Retrive the end edge back 
    if(this.endOfs === 0) {
      const end = this.previous(this.end, true);
      if(!!end) { this.setEnd(end, -1);}
    }
    // Special case, if now the selection collapsed we are done.
    if(this.collapsed) { return this; }
    // Push the start edge ahead
    if(this.startOfs === this.start.length) {
      const start = this.next(this.start, true);
      if(!!start) { this.setStart(start, 0);}
    }

    return this;
  }
  /** Forces the selection to wrap around the closes text word boundaries */
  public wordWrap(): EditableSelection {
    // Skips on invalid selection
    if(!this.valid) { return this; }
    // Seeks for the word edges around the cursor at start node
    const edges = this.start.edges(this.startOfs);
    // When collapsed, just set the selection at the given edges 
    if(this.collapsed) { return this.set(this.start, edges[0], this.start, edges[1]); }
    // Seeks for the edges at the end node otherwise
    this.startOfs = edges[0];
    this.endOfs = this.end.edges(this.endOfs)[1];
    return this.mark();
  }

  private fromDom(node: Node, offset: number): [EditableContent, number]{
    // Skips null nodes
    if(!node) { return [null, 0]; }
    // If node is a text node we look for the parent span element assuming 
    // its ID correctly maps the corresponding tree data editable
    if(node.nodeType === Node.TEXT_NODE) {
      // Gets the text node parent elements (a span or an anchor)
      // note: since IE supports parentElement only on Elements, we cast the parentNode instead
      const element = node.parentNode as Element;
      // Walks the tree searching for the node to return
      const txt = this.root.walkTree(!!element && element.id);
      // Zeroes the offset on empty texts 
      return [txt, txt.empty ? 0 : offset];    
    }

    // Returns the parent element and the child offset otherwise
    return[this.root.walkTree(!!node && (node as Element).id), offset];

    /*
    // If not, selection is likely falling on a parent element, so, 
    // searches for the child element relative to the parent offset 
    let child = node.childNodes[offset] as Node;
    // Than seeks the first element (so basically skipping comments)
    while(!!child && child.nodeType !== Node.ELEMENT_NODE) {
      child = child.nextSibling;
    }
    // Walks the tree returning the matching child node with 0 offset
    return[ this.root.walkTree(!!child && (child as Element).id), 0];
    */
  }
  /** Queries the document for the current selection */
  public query(from: Document): EditableSelection {

    if(!from) { return null; }

    try {
      // Query for the document selection range
      const sel = from.getSelection();
      const range = (!!sel && sel.rangeCount > 0) && sel.getRangeAt(0);
      if(!!range) {

        console.log(range);

        // Cut it short on a collapsed range
        if(range.collapsed) { 
          // Maps the cursor position at once
          this.setCursor(...this.fromDom(range.startContainer, range.startOffset));
        }
        // Maps the full range otherwise
        else {
          // Maps the selection start node to the data node
          this.setStart(...this.fromDom(range.startContainer, range.startOffset));
          // Maps the selection end node to the data node
          this.setEnd(...this.fromDom(range.endContainer, range.endOffset));
          // Makes sure start node comes always first
          this.sort();
        }
      }
      // Resets the values in case the range is undefined or null
      else { this.setCursor(undefined, 0); }

      console.log(this);
  
    } catch(e) {}

    // Resets the modified flag
    return this.mark(false);
  }

  private toDom(node: EditableContent, document: Document): Node {
    // Seeks for the dom element matching the internal node id
    const el = !!node ? document.getElementById(node.id) : null;
    if(!el) { return null; }// No element found
    // Text nodes are rendered as span elements...
    if(node instanceof EditableText) {
      // Seeks for the very first text node within the element children 
      let child = !!el && el.firstChild as Node;
      while(!!child) {
        // Basically skips comments
        if(child.nodeType === Node.TEXT_NODE) { return child; }
        // Goes next
        child = child.nextSibling;
      }
    }
    // Return the element otherwise
    return el;
  }
  /** Applies the current selection to the document */
  public apply(to: Document): EditableSelection {
    // Skips on invalid selections
    if(!to || !this.valid) { return this; }

    try {
      // Gets the current selection
      const sel = to.getSelection();
      // Removes all ranges (aka empty the selection)
      sel.removeAllRanges();
      // Creates a new range
      const range = to.createRange();
      // Maps the selection to the relevant dom nodes
      const start = this.toDom(this.start, to);
      const end = this.single ? start : this.toDom(this.end, to);
      // Apply the new range to the document
      range.setStart(start, this.startOfs);
      range.setEnd(end, this.endOfs);
      sel.addRange(range);
    }
    catch(e) {}

    // Resets the modified flag
    return this.mark(false);
  }
  /** Insert new text at the cursor position */
  public insert(char: string): EditableSelection {
    // Skips on invalid selection or null string
    if(!this.valid || !char) { return this; }
    // Deletes the selection, if any
    if(!this.collapsed) { this.delete(); }
    // Store a snapshot for undo history
    this.store();
    // In case the selection is on the end edge of a link...
    if(this.start.type !== 'text' && this.startOfs === this.start.length) {
      // Jumps on the following text, if any or create a new text node otherwise
      const next = this.next(this.start) || this.start.insertNext(this.start.create.text.set(''));
      // Updates the new position
      this.setCursor(next, 0);
    }
    // Inserts the new char at the specified position
    this.start.insert(char, this.startOfs);
    return this.move(char.length);
  }
  /** Deletes the selection from the document tree */
  public delete(): EditableSelection {
    // Skips on invalid selection
    if(!this.valid) { return this; }
    // Store a snapshot for undo history
    this.store();
    // Whenever the selection applies on a single node...
    if(this.single) {
      // Extracts the selected text within the node 
      this.start.extract(this.startOfs, this.endOfs);
      // If the node is still containing text, we are done...
      if(!this.start.empty) { return this.collapse(); }
    }
    //...otherwise we are dealing with multiple nodes, so...
    else {
      //...just cut the text away each side
      this.start.cut(0, this.startOfs);
      this.end.cut(this.endOfs);
    }
    // Moves the selection just outside the empty nodes, so, for merge to do its magic...  
    if(this.start.empty) { this.start = this.next(this.start) || this.start; }
    if(this.end.empty) { this.end = this.next(this.end) || this.end; }
    // Keeps the current text length...
    const ofs = this.start.length;
    // Merges the nodes
    this.start.merge(this.end);
    // Updates the cursor position
    return this.setCursor(this.start, ofs);
  }
  /**
   * Breaks the selection by inserting a new line char or an entire new editable block
   * @param newline when true, a new line charachter wil be used to break the selection,
   * when false a new editable block will be created contening the follwoing text sibling 
   * nodes exlucing this one.
   */
  public break(newline: boolean = false): EditableSelection {
    // Deletes the selection, if any
    if(!this.collapsed) { this.delete(); }
    // Store a snapshot for undo history
    this.store();
    // Just insert a new line on request forcing it always on links and table cells
    if(newline || this.belongsTo('link') || this.belongsTo('cell')) {
      this.start.insert('\n', this.startOfs);
      return this.move(1);
    }
    // Inserts an extra empty text on the start edge preserving the same style
    if(this.start.first && this.startOfs === 0) { 
      this.start.insertPrevious(this.start.clone().set('')); 
    }
    // Inserts an extra empty text node on the end edge preserving the same style
    if(this.start.last && this.startOfs === this.start.length) { 
      this.start.insertNext(this.start.clone().set('')); 
    }
    // Makes sure the cursor is on the right side of node's edges 
    if(this.startOfs === this.start.length) { this.setCursor(this.next(this.start), 0);}
    // Breaks the content from this node foreward in a new editable container
    const node = this.start.split(this.startOfs).break();
    // Updates the cursor position
    return this.setCursor(node, 0);
  }
  /** Splits the seleciton at the edges, so, the resulting selection will be including full nodes only */
  public split(): EditableSelection {
    // Skips on invalid selection
    if(!this.valid) { return this; }
    if(this.single) {
      // Splits the single node both sides
      const node = this.start.split(this.startOfs, this.endOfs); 
      this.set(node, 0, node, -1);
    }
    else {
      // Splits the multi selection both ends
      const start = this.start.split(this.startOfs);
      const end = this.end.split(0, this.endOfs);
      this.set(start, 0, end, -1);
    }
    return this;
  }
  /** 
   * Defragments the selections, so, minimizing the number of text nodes comprised in it
   * by joining siblings sharing the same attributes.
   */
  public defrag(): EditableSelection {
    // Skips on invalid selection
    if(!this.valid) { return this; }
    // Save the current selection
    this.save(this.root);
    // Defrags the few editable containers between the nodes
    this.containers( container => container.defrag() );
    // Restores the selection
    this.restore(this.root).trim();
    // Returns the selection supporting chaining
    return this;
  }
  /** Returns the current selection alignement (corresponding to the start node container's) */
  public get align(): wmAlignType {
    return this.valid ? this.start.align : 'left';
  }
  /** Applies the given alignemnt to the selection */
  public set align(align: wmAlignType) {

    this.store().containers( container => container.align = align ).mark();

  }
  /** Returns the current selection level (corresponding to the start node container's) */
  public get level(): number { 
    return this.valid ? this.start.level : 0;
  }
  /** Applies a new level to the selection */
  public set level(level: number) {
    // Skips on invalid selection
    if(!this.valid) { return; }
    // Applies the level on the containers within the selection
    this.store().containers( container => container.level = level ).mark();
  }
  /** Returns the style of the selection always corresponding to the style of the start node */
  public get style(): wmTextStyle[] {
    return this.valid ? this.start.style : [];
  }
  /** Applies the given style to the selection */
  public set style(style: wmTextStyle[]) {
    // Skips on invalid selection
    if(this.valid) {
      // Store a snapshot for undo history
      this.store();
      // Forces wordwrapping when collapsed 
      if(this.collapsed) { this.wordWrap(); }
      // Applies the given style to all the nodes within the selection
      this.trim().split().nodes( node => node.style = style ).defrag();
    }
  }
  /** Resets the selection style removing all formatting */
  public clear(): EditableSelection {
    return this.style = [], this;
  }
  /** 
   * Applies (or removes) a given style set to the selection.
   * @param style style array to be applied.
   * @param remove when true, the requested style will be removed instead.
   */
  public format(style: wmTextStyle[], remove: boolean = false): EditableSelection {
    // Skips on invalid selection
    if(!this.valid) { return this; }
    // Store a snapshot for undo history
    this.store();
    // Forces wordwrapping when collapsed 
    if(this.collapsed) { this.wordWrap(); }
    // Trims and splits the selection
    this.trim().split();
    // Formats all the nodes within the selection
    this.nodes( node => {
      if(remove) { node.unformat(style); } 
      else { node.format(style); } 
    });
    // Defragments the text nodes when done
    return this.defrag();
  }
  /** Toggles a single format style on/off */
  public toggleFormat(style: wmTextStyle): EditableSelection {
    const remove = this.style.some( s => s === style );
    return this.format([style], remove);
  }

  /** Turns the selection into a link node */
  public link(url: string): EditableSelection {
    // Performs unlinking when url is null
    if(!url) { return this.unlink(); }
    // Skips on invalid selection
    if(!this.valid) { return this; }
    // Store a snapshot for undo history
    this.store();
    // Forces wordwrapping when collapsed 
    if(this.collapsed) { this.wordWrap(); }
    // Trims and splits the selection
    this.trim().split();
    // Join multiple nodes when needed
    if(this.multi) {
      let node = this.next(this.start, true);
      while(!!node && node.compare(this.end) <= 0) {
        this.start.join(node);
        if(node === this.end) { break; }
        node = this.next(this.start, true);
      }
    }
    // Turns the resulting node into a link
    this.start.link(url);
    // Updates the selection
    return this.set(this.start, 0, this.start, -1);
  }

  /** Removes the links falling into the selection */
  public unlink(): EditableSelection {
    // Skips on invalid selection
    if(!this.valid) { return this; }
    // Turns links into plain text
    return this.store().nodes( node => node.link(null) ).defrag();
  }

  /** Picks the first selection's parent matching the specified types  */
  public pick(...types: wmNodeType[]): EditableContent {
    return this.valid ? this.start.climb(...types) : null;
  }

  /** Removes an indentation level when applicable */
  public outdent(): EditableSelection {
    // Guesses which indentation the selection belongs to
    const indent = this.pick('blockquote', 'bulleted', 'numbered'); 
    if(!indent) { return this; }
    // Unindent all the containers within the selection
    this.store().containers( container => container.unindent(indent.type as wmIndentType) );
    // Mark the selection to update on the next rendering round
    return this.mark();
  }

  /** Applies an indentation of the requested type or increase the indentation level when applicable */
  public indent(): EditableSelection {
    // Guesses which list the selection belongs to
    const list = this.pick('bulleted', 'numbered'); 
    // At this point, skips indentation when type is not specified
    if(!list) { return this; }
    // Indent all the containers within the selection
    this.store().containers( item => item.indent(list.type as wmIndentType) );
    // Mark the selection to update on the next rendering round
    return this.mark();
  }

  /** Toggles selection in/out of a list */
  public toggleList(type: 'bulleted'|'numbered'): EditableSelection {
    // Skips on invalid selection
    if(!this.valid) { return this; }
    // Store a snapshot for undo history
    this.store();
    // Verifies if the selection already belongs to a list
    const list = this.start.climb('bulleted', 'numbered'); 
    if(!!list) {
      // If so, unindent the list it belongs to
      this.containers( item => item.unindent(list.type as wmIndentType) );
      // Stop on toggle off
      if(list.type === type) { return this.mark(); }
    }
    // Apply the requested list identation excluding table cells
    this.containers( item => { if(item.type !== 'cell') { item.indent(type); } });
    // Mark the selection to update on the next rendering round
    return this.mark();
  }

  /** Toggles selection in/out of a blockquote */
  public toggleQuote(): EditableSelection {
    // Skips on invalid selection
    if(!this.valid) { return this; }
    // Store a snapshot for undo history
    this.store();

    const block = this.start.climb('blockquote'); 
    if(!!block) { 
      return this.containers( item => item.unindent('blockquote') ).mark(); 
    }

    let node = this.start.ancestor(1);
    while(!!node && node.compare(this.end) < 0) { 
      node = node.indent('blockquote').nextSibling();
    }
    // Mark the selection to update on the next rendering round
    return this.mark();
  }

  /** Returns true if the current selection fully belongs to a single specified node or branch */
  public belongsTo(type: wmNodeType): boolean {
    // Skips on invalid selection
    if(!this.valid) { return false; }
    // Perform the check
    switch(type) {
      // Evevrything belongs to the document
      case 'document': return true;
      // Inline types
      case 'text': case 'link':
      return this.single && this.start.type === type && this.startOfs < this.start.length;
      // Editable container types
      case 'item': case 'cell':
      return this.contained && this.start.container.type === type;
      // Block types
      case 'blockquote': case 'bulleted': case 'numbered': case 'row': case 'table': case 'image':
      // Climbs up to the specified ancestor
      const block = this.start.climb(type);
      // Returns false when not there
      if(!block) { return false; }
      // Return true when there on a single node selection
      if(this.single) { return true; }
      // Compares the start and end node ancestors otherwise
      return block === this.end.climb(type);
    }

    return false;
  }
  /** Returns true whenever the inspected node falls within the current selection  */
  public selected(node: EditableContent): boolean {
    // Skips on invalid selection
    return this.valid && !!node && (
      // Node matches the selection itself
      node === this.start ||
      // Node is the selection's ancestor of the matching type
      node === this.start.climb(node.type) ||
      // Node falls within the selection range
      this.start.compare(node) <= 0 && this.end.compare(node) >= 0
    );
  }
  /** Returns a tree fragment containing a copy of the selection  */
  public copy(): EditableContent {
    // Skips on invalid selection
    if(!this.valid) { return null; }
    // Forces wordwrapping when collapsed 
    if(this.collapsed) { this.wordWrap(); }
    // Trims the selection's edges
    this.trim();
    // Clones the selection into a tree fragment
    const fragment = this.start.fragment(this.end);
    // Skips any further process on whole selection
    if(this.whole) { return fragment; }
    // Gets the starting text node
    const start = fragment.firstDescendant();
    // Trims the text according to the selection offsets
    if(this.single) { start.cut(this.startOfs, this.endOfs); }
    // In case of multiple node selection
    else {
      // Trims both ends separately
      const end = fragment.lastDescendant();
      start.cut(this.startOfs);
      end.cut(0, this.endOfs);
    }
    // Returns the fragments
    return fragment;
  }

   /** Pastes a data fragment to the current selection */
  public paste(source: wmDocument): EditableSelection {
    // Skips on invalid selection
    if(!this.valid) { return this; }
    // Builds the fragment to paste from
    const fragment = this.root.create.document.load(source);
    if(!!fragment) {
      // Paste the content as text within links or table cells
      if(this.belongsTo('link') || this.belongsTo('cell')) {
        return this.insert(fragment.value);
      }
      // Breaks the selection at the current position otherwise
      this.break().move(-1, 0);
      // Cleaves the tree and inserts the new content in between
      this.start.cleave()
        .insertNext(fragment)
        .unwrap();
      // Merges the new content first node with start
      const first = fragment.firstDescendant();
      this.start.merge(first);
      // Merges the new content last node with end 
      const last = fragment.lastDescendant();
      last.merge(this.end);
      // Collapses the selection in a cursor at the end edge
      this.collapse(true);
    }
    // Done
    return this;
  }

  /** Insert a new empty table
   * @param rows number of rows
   * @param cols number of columns
   */
  public tableNew(rows: number, cols: number): EditableSelection {
    // Skips on invalid selection
    if(!this.valid) { return this; }
    // Creates a new empty table
    const table = this.root.create.table.initTable(rows, cols);
    if(!!table) {
      // Store the current snapshot in the history
      this.store();
      // Cleaves the tree and inserts the new table in between
      this.start.cleave().insertNext(table);
    }
    // Done
    return this;
  }

  public tableRow(where: 'above'|'below'): EditableSelection {
    
    const table = this.pick('table') as EditableTable;
    if(!table) { return this; }

    this.store();
    
    table.insertRow(this.pick('row') as EditableRow, where);
    
    return this;
  }

  public tableColumn(where: 'left'|'right'): EditableSelection {
    
    const table = this.pick('table') as EditableTable;
    if(!table) { return this; }

    this.store();
    
    table.insertColumn(this.pick('cell') as EditableCell, where);
    
    return this;
  }

  public tableDelete(what: 'row'|'column'|'table') {

    const table = this.pick('table') as EditableTable;
    if(!table) { return this; }

    this.store();

    switch(what) { 
      case 'row':
      table.removeRow(this.pick('row') as EditableRow);
      break;

      case 'column':
      table.removeColumn(this.pick('cell') as EditableCell);
      break;

      case 'table': 
      table.remove() as EditableTable;
    }
    
    return this;
  }

  /***** HISTORY UNDO/REDO *****/

  private store$ = new Subject<EditableDoc>();
  private history: wmDocument[];
  private timeIndex: number;
  private sub$: Subscription;

  /** Clears the history buffer */
  public clearHistory(): EditableSelection {
    // Unsubscribe the previous subscription, if any
    if(!!this.sub$) { this.sub$.unsubscribe(); }
    // Initializes the history buffer
    this.timeIndex = 0;
    this.history = [];
    return this;
  }

  /** Initilizes the history buffer */
  public enableHistory(debounce: number = 2000, limit: number = 128): EditableSelection {
    // Clears the history buffer
    this.clearHistory();
    // Builts up the stream optimizing the amout of snapshot saved in the history 
    this.sub$ = this.store$.pipe( 
      // Append a time interval between storing emissions
      timeInterval(), 
      // Filters requests coming to fast (within 'debounce time')
      filter( payload => this.history.length === 0 || payload.interval > debounce), 
      // Gets a snapshot of the document with updated selection
      map( payload => this.save( payload.value.clone() ).data ),
    // Subscribes the history save handler
    ).subscribe( snapshot => {
      // Wipes the further future undoed snapshots since they are now 
      if(this.timeIndex > 0) {
        // Save the last snapshot wiping the further future undoed once
        this.history.splice(0, this.timeIndex + 1, snapshot);
        // Resets the time index
        this.timeIndex = 0;
      }
      // Saves the last snapshot in the history
      else { this.history.unshift(snapshot); }
      // Removes the oldest snapshot when exceeeding the history limit
      if(this.history.length > limit) { this.history.pop(); }
    });

    return this;
  }

  /** Stores a snapshot in the undo/redo history buffer 
   * @param force (option) when true forces the storage unconditionally.
   * Storage will be performed conditionally to the time elapsed since 
   * the last modification otherwise.
  */
  public store(force?: boolean): EditableSelection { 

    if(!this.root || !this.root.data) { debugger; }

    if(!!force) {
      // Pushes a snapshot into the history buffer unconditionally
      this.history.unshift( this.save( this.root.clone() ).data ); 
      // Return this for chaining
      return this; 
    }
    // Pushes the document for conditional history save
    return this.store$.next(this.root), this; 
  }

  /** Returns true whenever the last modifications can be undone */
  get undoable(): boolean { return this.history.length > 0 && this.timeIndex < this.history.length - (!!this.timeIndex ? 1 : 0); }

  /** Undoes the latest changes. It requires enableHistory() to be called */
  public undo(): EditableSelection {
    // Stops undoing when history is finished
    if(!this.undoable) { return this; }
    // Saves the present moment to be restored eventually
    if(this.timeIndex === 0) { this.store(true); }
    // Gets the latest snapshot from the history
    const snapshot = this.history[++this.timeIndex];
    // Reloads the snapshot's content restoring the selection too
    return this.restore( this.root.load(snapshot) as EditableDoc);
  }

  /** Returns true whenever the last undone modifications can be redone */
  get redoable(): boolean { return this.history.length > 0 && this.timeIndex > 0; }

  /** Redoes the last undone modifications. It requires enableHistory() to be called */
  public redo(): EditableSelection {
    // Stops redoing when back to the present
    if(!this.redoable) { return this; }
    // Gets the previous snapshot from the history
    const snapshot = this.history[--this.timeIndex];
    // Removes the newest snapshot when back to the present
    if(this.timeIndex === 0) { this.history.shift(); }
    // Reloads the snapshot's content restoring the selection too
    return this.restore( this.root.load(snapshot) as EditableDoc);
  }
}