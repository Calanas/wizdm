import type { StripeElement, StripeElementOptions, StripeChangeEventObject, SupportedStripeElementType } from './generic-types';
import { OnInit, OnChanges, SimpleChanges, OnDestroy, ElementRef, Input, Output, EventEmitter, Directive } from '@angular/core';
import { StripeElementsDirective, StripeElementsConfig } from './elements.directive';
import { coerceBooleanProperty } from '@angular/cdk/coercion';
import type { StripeError } from '@stripe/stripe-js';

/** 
 * Abstract generic class turning a StripeElement into an Angular component with basic features
 * To be used as the base class for all the Stripe related specific components: StripeCard...
 */
/** @dynamic - tells ngc to ignore the error on type T generated by strictEmitMetadata: true */
@Directive()
export abstract class StripeElementDirective<T extends SupportedStripeElementType> implements OnInit, OnChanges, OnDestroy {

  constructor(readonly elementType: T, private elements: StripeElementsDirective, private config: StripeElementsConfig, private ref: ElementRef<HTMLElement>) {

    if(!elements) {
      throw new Error(`
        You're attempting to use a Stripe Element out of a propoer StripeElements container.
        Make sure to wrap all the controls within a wm-stripe-elements directive.
      `);
    }
  }

  /**
   * Implement this getter to provide component specific options during element creation and update
   */
  protected abstract get options(): StripeElementOptions<T>;

  /** The stripe element */
  public element: StripeElement<T>;
  
  /** The latest change value */
  public value: StripeChangeEventObject<T>;

  /** True whenever the element is fully loaded */
  public ready: boolean = false;

  /** True whenever the element is disabled */
  public disabled: boolean = false;
  
  /** True whenever the element is focused */
  public focused: boolean;

  /** The element's locale */
  public locale: string;

  /** True whenever the element is empty */
  public get empty(): boolean {
    return !this.value || this.value.empty;
  }

  /** True whenever the element is complete and valid */
  public get complete(): boolean {
    return !!this.value && this.value.complete;
  }

  /** The StripeError or null */
  public get error(): StripeError | null {
    return !!this.value && this.value.error || null;
  }

  ngOnInit() { 

    // Keeps track of the current Elements locale
    this.locale = this.elements.locale;

    // Resets the local variables
    this.focused = this.value = undefined;

    // Creates the requested Stripe element
    this.element = this.elements.create(this.elementType as any, { classes: this.config?.classes, style: this.config?.style, ...this.options }) as any;

    // Hooks on the element's events
    this.element.on('ready',  () => { this.readyChange.emit(this.ready = true); });
    this.element.on('focus',  () => { this.focused = true; this.focusChange.emit(); });
    this.element.on('blur',   () => { this.focused = false; this.blurChange.emit(); });
    this.element.on('escape', () => { this.escapeChange.emit(); });
    (this.element as unknown as any).on('change', (value: StripeChangeEventObject<T>) => this.valueChange.emit(this.value = value) );
    
    // Mounts the element on the DOM
    this.element.mount(this.ref.nativeElement); 
  }

  ngOnChanges(changes: SimpleChanges) { 
    // Updates the element on input changes
    this.update(this.options); 
  }

  ngDoCheck() {

    // Whenever the StripeElements locale has changed...
    if(this.elements.locale !== this.locale) {
      // Disposed of the current element      
      this.ngOnDestroy();
      // Creates a new element
      this.ngOnInit();
      // Updates the locale
      this.locale = this.elements.locale;
    }
  }

  ngOnDestroy() { 
    // Resets the ready flag
    this.readyChange.emit(this.ready = false); 
    // Disposes of the element    
    this.element && this.element.destroy(); 
  }

  /** Updates the element */
  public update(options: Partial<StripeElementOptions<T>>) { 

    if(!this.element) { return; }

    // Ensures to correctly reflect the disabled status
    if('disabled' in options) {
      this.disabled = (options as any).disabled;
    }
    
    // Updates the element
    this.element.update(options as any); 
  }

  /** Focus the element */
  public focus() { this.element && this.element.focus(); }

  /** Blurs the element */
  public blur() { this.element && this.element.blur(); }

  /** Clears the element */
  public clear() { this.element && this.element.clear(); }

  /** Disables the control */
  @Input('disabled') set disableSetter(value: boolean) { this.disabled = coerceBooleanProperty(value); }

  /** Emits when fully loaded */
  @Output('ready') readyChange = new EventEmitter<boolean>(true);
  
  /** Emits when focused */
  @Output('focus') focusChange = new EventEmitter<void>();
  
  /** Emits when blurred */
  @Output('blur') blurChange = new EventEmitter<void>();

  /** Emits when escape is pressed */
  @Output('escape') escapeChange = new EventEmitter<void>();
  
  /** Emits on status changes */
  @Output('change') valueChange = new EventEmitter<StripeChangeEventObject<T>>();
}