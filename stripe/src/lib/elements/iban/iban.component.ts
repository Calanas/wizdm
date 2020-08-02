import { StripeElementsDirective, StripeElementDirective, StripeElementsConfig, STRIPE_ELEMENTS_CONFIG } from '@wizdm/stripe/elements';
import { Component, Inject, Optional, forwardRef, Input, ElementRef } from '@angular/core';
import type { StripeIbanElementOptions } from '@stripe/stripe-js';
import { coerceBooleanProperty } from '@angular/cdk/coercion';

/** Stripe IBAN Element for Angular */
@Component({
  selector: 'wm-stripe-iban',
  template: '',
  providers: [
    { provide: StripeElementDirective, useExisting: forwardRef(() => StripeIban) }
  ]
})
export class StripeIban extends StripeElementDirective<'iban'> {

  constructor(@Optional() elements: StripeElementsDirective, @Optional() @Inject(STRIPE_ELEMENTS_CONFIG) config: StripeElementsConfig, ref: ElementRef<HTMLElement>) {
    super('iban', elements, config, ref);
  }

  /** IBAN specific options */
  protected get options(): StripeIbanElementOptions {
    return { 
     disabled: this.disabled,
     hideIcon: this.hideIcon,
     iconStyle: this.iconStyle,
     supportedCountries: this.supportedCountries || ['SEPA']
    };
  }
  
  /** Hides the card icon */
  @Input('hideIcon') set hideIconSetter(value: boolean) { this.hideIcon = coerceBooleanProperty(value); }
  public hideIcon: boolean;

  /** Selects the icon style */
  @Input() iconStyle: StripeIbanElementOptions['iconStyle'];

  /** Supported countries */
  @Input() supportedCountries: string[]
}