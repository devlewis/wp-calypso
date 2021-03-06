/**
 * External dependencies
 */
import React from 'react';
import { connect } from 'react-redux';
import { localize } from 'i18n-calypso';
import { includes, isEmpty, map, deburr } from 'lodash';
import debugFactory from 'debug';

/**
 * Internal dependencies
 */
import config from 'config';
import wpcom from 'lib/wp';
import { recordTracksEvent } from 'lib/analytics/tracks';
import formState from 'lib/form-state';
import { login } from 'lib/paths';
import ValidationFieldset from 'signup/validation-fieldset';
import FormLabel from 'components/forms/form-label';
import FormButton from 'components/forms/form-button';
import FormTextInput from 'components/forms/form-text-input';
import P2StepWrapper from 'signup/p2-step-wrapper';
import { saveSignupStep, submitSignupStep } from 'state/signup/progress/actions';

/**
 * Style dependencies
 */
import './style.scss';

const debug = debugFactory( 'calypso:steps:p2-site' );

/**
 * Constants
 */
const VALIDATION_DELAY_AFTER_FIELD_CHANGES = 1500;
const ERROR_CODE_MISSING_SITE_TITLE = 123; // Random number, we don't need it.
const ERROR_CODE_MISSING_SITE = 321; // Random number, we don't need it.

/**
 * Module variables
 */
let siteUrlsSearched = [],
	timesValidationFailed = 0;

class P2Site extends React.Component {
	static displayName = 'P2Site';

	constructor( props ) {
		super( props );

		let initialState;

		if ( props?.step?.form ) {
			initialState = props.step.form;

			if ( ! isEmpty( props.step.errors ) ) {
				initialState = formState.setFieldErrors(
					formState.setFieldsValidating( initialState ),
					{
						site: props.step.errors[ 0 ].message,
					},
					true
				);
			}
		}

		this.formStateController = new formState.Controller( {
			fieldNames: [ 'site', 'siteTitle' ],
			sanitizerFunction: this.sanitize,
			validatorFunction: this.validate,
			onNewState: this.setFormState,
			onError: this.handleFormControllerError,
			debounceWait: VALIDATION_DELAY_AFTER_FIELD_CHANGES,
			hideFieldErrorsOnChange: true,
			initialState: initialState,
			skipSanitizeAndValidateOnFieldChange: true,
		} );

		this.state = {
			form: this.formStateController.getInitialState(),
			submitting: false,
		};
	}

	componentWillUnmount() {
		this.save();
	}

	sanitizeSubdomain = ( domain ) => {
		if ( ! domain ) {
			return domain;
		}
		return deburr( domain )
			.replace( /[^a-zA-Z0-9]/g, '' )
			.toLowerCase();
	};

	sanitize = ( fields, onComplete ) => {
		const sanitizedSubdomain = this.sanitizeSubdomain( fields.site );
		if ( fields.site !== sanitizedSubdomain ) {
			onComplete( { site: sanitizedSubdomain, siteTitle: fields.siteTitle } );
		}
	};

	validate = ( fields, onComplete ) => {
		const messages = {};

		if ( isEmpty( fields.siteTitle ) ) {
			messages.siteTitle = {
				[ ERROR_CODE_MISSING_SITE_TITLE ]: this.props.translate(
					'Please enter your team or project name.'
				),
			};
		}

		if ( isEmpty( fields.site ) ) {
			messages.site = {
				[ ERROR_CODE_MISSING_SITE ]: this.props.translate( 'Please enter your site address.' ),
			};
		}

		if ( ! isEmpty( fields.site ) ) {
			wpcom.undocumented().sitesNew(
				{
					blog_name: `${ fields.site }.p2.blog`,
					blog_title: fields.siteTitle,
					validate: true,
				},
				( error, response ) => {
					debug( error, response );

					if ( error && error.message ) {
						if ( fields.site && ! includes( siteUrlsSearched, fields.site ) ) {
							siteUrlsSearched.push( fields.site );

							recordTracksEvent( 'calypso_signup_wp_for_teams_site_url_validation_failed', {
								error: error.error,
								site_url: fields.site,
							} );
						}

						timesValidationFailed++;

						if ( error.error === 'blog_title_invalid' ) {
							messages.siteTitle = {
								[ error.error ]: this.props.translate(
									'Please enter a valid team or project name.'
								),
							};
						} else {
							messages.site = {
								[ error.error ]: error.message,
							};
						}
					}

					onComplete( null, messages );
				}
			);
		} else if ( ! isEmpty( messages ) ) {
			onComplete( null, messages );
		}
	};

	setFormState = ( state ) => {
		this.setState( { form: state } );
	};

	resetAnalyticsData = () => {
		siteUrlsSearched = [];
		timesValidationFailed = 0;
	};

	handleSubmit = ( event ) => {
		event.preventDefault();

		this.setState( { submitting: true } );

		this.formStateController.handleSubmit( ( hasErrors ) => {
			const site = formState.getFieldValue( this.state.form, 'site' );
			const siteTitle = formState.getFieldValue( this.state.form, 'siteTitle' );

			this.setState( { submitting: false } );

			if ( hasErrors ) {
				return;
			}

			recordTracksEvent( 'calypso_signup_wp_for_teams_site_step_submit', {
				unique_site_urls_searched: siteUrlsSearched.length,
				times_validation_failed: timesValidationFailed,
			} );

			this.resetAnalyticsData();

			this.props.submitSignupStep( {
				stepName: this.props.stepName,
				form: this.state.form,
				site,
				siteTitle,
			} );

			this.props.goToNextStep();
		} );
	};

	handleBlur = () => {
		this.formStateController.sanitize();
		this.save();
	};

	save = () => {
		this.props.saveSignupStep( {
			stepName: 'p2-site',
			form: this.state.form,
		} );
	};

	handleChangeEvent = ( event ) => {
		this.formStateController.handleFieldChange( {
			name: event.target.name,
			value: event.target.value,
		} );
	};

	handleFormControllerError = ( error ) => {
		if ( error ) {
			throw error;
		}
	};

	getErrorMessagesWithLogin = ( fieldName ) => {
		const link = login( {
				isNative: config.isEnabled( 'login/native-login-links' ),
				redirectTo: window.location.href,
			} ),
			messages = formState.getFieldErrorMessages( this.state.form, fieldName );

		if ( ! messages ) {
			return;
		}

		return map( messages, ( message, error_code ) => {
			if ( error_code === 'blog_name_reserved' ) {
				return (
					<span>
						<p>
							{ message }
							&nbsp;
							{ this.props.translate(
								'Is this your username? {{a}}Log in now to claim this site address{{/a}}.',
								{
									components: {
										a: <a href={ link } />,
									},
								}
							) }
						</p>
					</span>
				);
			}
			return message;
		} );
	};

	formFields = () => {
		const fieldDisabled = this.state.submitting;

		return (
			<>
				<ValidationFieldset
					errorMessages={ this.getErrorMessagesWithLogin( 'siteTitle' ) }
					className="p2-site__validation-site-title"
				>
					<FormLabel htmlFor="site-title-input">
						{ this.props.translate( 'Name your team or project' ) }
					</FormLabel>
					<FormTextInput
						id="site-title-input"
						autoFocus={ true } // eslint-disable-line jsx-a11y/no-autofocus
						autoCapitalize={ 'off' }
						className="p2-site__site-title"
						disabled={ fieldDisabled }
						type="text"
						name="site-title"
						value={ formState.getFieldValue( this.state.form, 'siteTitle' ) }
						isError={ formState.isFieldInvalid( this.state.form, 'siteTitle' ) }
						isValid={ formState.isFieldValid( this.state.form, 'siteTitle' ) }
						onBlur={ this.handleBlur }
						onChange={ this.handleChangeEvent }
					/>
				</ValidationFieldset>
				<ValidationFieldset
					errorMessages={ this.getErrorMessagesWithLogin( 'site' ) }
					className="p2-site__validation-site"
				>
					<FormLabel htmlFor="site-address-input">
						{ this.props.translate( 'Choose a site address' ) }
					</FormLabel>
					<FormTextInput
						id="site-address-input"
						autoCapitalize={ 'off' }
						className="p2-site__site-url"
						disabled={ fieldDisabled }
						type="text"
						name="site"
						value={ formState.getFieldValue( this.state.form, 'site' ) }
						isError={ formState.isFieldInvalid( this.state.form, 'site' ) }
						isValid={ formState.isFieldValid( this.state.form, 'site' ) }
						onBlur={ this.handleBlur }
						onChange={ this.handleChangeEvent }
					/>
					<span className="p2-site__wordpress-domain-suffix">.p2.blog</span>
				</ValidationFieldset>
			</>
		);
	};

	buttonText = () => {
		if ( this.props.step && 'completed' === this.props.step.status ) {
			return this.props.translate( 'Site created - Go to next step' );
		}

		return this.props.translate( 'Continue' );
	};

	render() {
		return (
			<P2StepWrapper
				flowName={ this.props.flowName }
				stepName={ this.props.stepName }
				positionInFlow={ this.props.positionInFlow }
				headerText={ this.props.translate(
					'Share, discuss, review, and collaborate across time zones, without interruptions.'
				) }
			>
				<form className="p2-site__form" onSubmit={ this.handleSubmit } noValidate>
					{ this.formFields() }
					<div className="p2-site__form-footer">
						<FormButton disabled={ this.state.submitting } className="p2-site__form-submit-btn">
							{ this.buttonText() }
						</FormButton>
					</div>
				</form>

				<div className="p2-site__learn-more">
					<a href="https://wordpress.com/p2" className="p2-site__learn-more-link">
						{ this.props.translate( 'Learn more about P2' ) }
					</a>
				</div>
			</P2StepWrapper>
		);
	}
}

export default connect( null, { saveSignupStep, submitSignupStep } )( localize( P2Site ) );
