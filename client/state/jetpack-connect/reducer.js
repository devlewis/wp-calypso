/**
 * Internal dependencies
 */
import {
	JETPACK_CONNECT_CHECK_URL,
	JETPACK_CONNECT_CHECK_URL_RECEIVE,
	JETPACK_CONNECT_DISMISS_URL_STATUS,
	JETPACK_CONNECT_QUERY_SET,
	JETPACK_CONNECT_QUERY_UPDATE,
	SERIALIZE,
	DESERIALIZE
} from 'state/action-types';
import { combineReducers } from 'redux';

export function jetpackConnectSite( state = {}, action ) {
	switch ( action.type ) {
		case JETPACK_CONNECT_CHECK_URL:
			return Object.assign( {}, { url: action.url, isFetching: true, isFetched: false, isDismissed: false, data: {} } );
		case JETPACK_CONNECT_CHECK_URL_RECEIVE:
			if ( action.url === state.url ) {
				return Object.assign( {}, state, { isFetching: false, isFetched: true, data: action.data } );
			}
			return state;
		case JETPACK_CONNECT_DISMISS_URL_STATUS:
			if ( action.url === state.url ) {
				return Object.assign( {}, state, { isDismissed: true } );
			}
			return state;
	}
	return state;
}

export function jetpackConnectAuthorize( state = {}, action ) {
	switch ( action.type ) {
		case JETPACK_CONNECT_QUERY_SET:
			return Object.assign( {}, state, { queryObject: action.queryObject } );
		case JETPACK_CONNECT_QUERY_UPDATE:
			return Object.assign( {}, state, { queryObject: Object.assign( {}, state.queryObject, { [ action.property ]: action.value } ) } );
		case SERIALIZE:
		case DESERIALIZE:
			return state;
	}
	return state;
}

export default combineReducers( {
	jetpackConnectSite,
	jetpackConnectAuthorize
} );
