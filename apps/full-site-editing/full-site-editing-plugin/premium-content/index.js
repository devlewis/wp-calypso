/**
 * External dependencies
 */
import { mergeWith } from 'lodash';

/**
 * WordPress dependencies
 */
import apiFetch from '@wordpress/api-fetch';
import { getBlockType, registerBlockType, unregisterBlockType } from '@wordpress/blocks';
import { _x } from '@wordpress/i18n';
import {
	__experimentalAlignmentHookSettingsProvider,
	__experimentalBlock,
} from '@wordpress/block-editor';

/**
 * Internal dependencies
 */
import * as container from './blocks/container';
import * as subscriberView from './blocks/subscriber-view';
import * as loggedOutView from './blocks/logged-out-view';
import * as buttons from './blocks/buttons';
import * as loginButton from './blocks/login-button';

const supportsDecoupledBlocks = __experimentalAlignmentHookSettingsProvider && __experimentalBlock;

/**
 * Function to register an individual block.
 *
 * @typedef {import('@wordpress/blocks').BlockConfiguration} BlockConfiguration
 *
 * @typedef {object} Block
 * @property {string} name
 * @property {string} category
 * @property {BlockConfiguration} settings
 *
 * @param {Block} block The block to be registered.
 */
const registerBlock = ( block ) => {
	if ( ! block ) {
		return;
	}

	const { name, category, settings } = block;

	registerBlockType( name, {
		category,
		...settings,
	} );
};

/**
 * Updates the settings of the given block.
 *
 * @param name {string} Block name
 * @param settings {object} Block settings
 */
const updateBlockType = ( name, settings ) => {
	const blockType = getBlockType( name );
	if ( ! blockType ) {
		return;
	}
	unregisterBlockType( name );
	const updatedSettings = mergeWith( {}, blockType, settings, ( objValue, srcValue ) => {
		if ( Array.isArray( objValue ) ) {
			return objValue.concat( srcValue );
		}
	} );
	registerBlockType( name, updatedSettings );
};

/**
 * Gets the current status of the Memberships module.
 *
 * @returns {Promise} Memberships status
 */
const getMembershipsStatus = async () => {
	try {
		return apiFetch( { path: '/wpcom/v2/memberships/status' } );
	} catch {
		return null;
	}
};

/**
 * Appends a "paid" tag to the Premium Content block title if site requires an upgrade.
 *
 * @param membershipsStatus {object} Memberships status
 */
const addPaidBlockFlags = ( membershipsStatus ) => {
	if ( ! membershipsStatus.should_upgrade_to_access_memberships ) {
		return;
	}

	const paidFlag = _x(
		'paid',
		'Short label appearing near a block requiring a paid plan',
		'full-site-editing'
	);

	updateBlockType( container.name, { title: `${ container.settings.title } (${ paidFlag })` } );
};

/**
 * Hides the buttons block from the inserter if the Memberships module is not set up.
 *
 * @param membershipsStatus {object} Memberships status
 */
const hideButtonsIfMembershipsNotSetUp = ( membershipsStatus ) => {
	if (
		! membershipsStatus.should_upgrade_to_access_memberships &&
		membershipsStatus.connected_account_id
	) {
		return;
	}

	updateBlockType( buttons.name, { supports: { inserter: false } } );
	updateBlockType( loginButton.name, { supports: { inserter: false } } );
};

/**
 * Configures the Premium Content blocks.
 */
const configurePremiumContentBlocks = async () => {
	const membershipsStatus = await getMembershipsStatus();
	addPaidBlockFlags( membershipsStatus );
	if ( supportsDecoupledBlocks ) {
		hideButtonsIfMembershipsNotSetUp( membershipsStatus );
	}
};

/**
 * Function to register Premium Content blocks.
 */
export const registerPremiumContentBlocks = () => {
	if ( supportsDecoupledBlocks ) {
		[ container, loggedOutView, subscriberView, buttons, loginButton ].forEach( registerBlock );
	} else {
		[ container, loggedOutView, subscriberView ].forEach( registerBlock );
	}
};

registerPremiumContentBlocks();
configurePremiumContentBlocks();
