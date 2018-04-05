/** @format */
/**
 * External dependencies
 */
import React from 'react';
import page from 'page';
import i18n from 'i18n-calypso';
import { find, pick } from 'lodash';

/**
 * Internal Dependencies
 */
import { getSiteFragment, getStatsDefaultSitePage, sectionify } from 'lib/route';
import analytics from 'lib/analytics';
import { recordPlaceholdersTiming } from 'lib/perfmon';
import titlecase from 'to-title-case';
import { savePreference } from 'state/preferences/actions';
import { getSite, getSiteOption } from 'state/sites/selectors';
import { getCurrentLayoutFocus } from 'state/ui/layout-focus/selectors';
import { setNextLayoutFocus } from 'state/ui/layout-focus/actions';
import { getSelectedSiteId } from 'state/ui/selectors';
import FollowList from 'lib/follow-list';
import StatsInsights from './stats-insights';
import StatsOverview from './overview';
import StatsSite from './site';
import StatsSummary from './summary';
import StatsPostDetail from './stats-post-detail';
import StatsCommentFollows from './comment-follows';
import ActivityLog from './activity-log';

const analyticsPageTitle = 'Stats';

function rangeOfPeriod( period, date ) {
	const periodRange = {
		period: period,
		startOf: date.clone().startOf( period ),
		endOf: date.clone().endOf( period ),
	};

	if ( 'week' === period ) {
		if ( '0' === date.format( 'd' ) ) {
			periodRange.startOf.subtract( 6, 'd' );
			periodRange.endOf.subtract( 6, 'd' );
		} else {
			periodRange.startOf.add( 1, 'd' );
			periodRange.endOf.add( 1, 'd' );
		}
	}

	periodRange.key = period + ':' + periodRange.endOf.format( 'YYYY-MM-DD' );

	return periodRange;
}

function getNumPeriodAgo( momentSiteZone, date, period ) {
	const endOfCurrentPeriod = momentSiteZone.endOf( period );
	const durationAgo = i18n.moment.duration( endOfCurrentPeriod.diff( date ) );
	let numPeriodAgo;

	switch ( period ) {
		case 'day':
			numPeriodAgo = durationAgo.asDays();
			break;
		case 'week':
			numPeriodAgo = durationAgo.asWeeks();
			break;
		case 'month':
			numPeriodAgo = durationAgo.asMonths();
			break;
		case 'year':
			numPeriodAgo = durationAgo.asYears();
			break;
	}
	return numPeriodAgo;
}

function getSiteFilters( siteId ) {
	const filters = [
		{
			title: i18n.translate( 'Insights' ),
			path: '/stats/insights/' + siteId,
			id: 'stats-insights',
		},
		{
			title: i18n.translate( 'Days' ),
			path: '/stats/day/' + siteId,
			id: 'stats-day',
			period: 'day',
		},
		{
			title: i18n.translate( 'Weeks' ),
			path: '/stats/week/' + siteId,
			id: 'stats-week',
			period: 'week',
		},
		{
			title: i18n.translate( 'Months' ),
			path: '/stats/month/' + siteId,
			id: 'stats-month',
			period: 'month',
		},
		{
			title: i18n.translate( 'Years' ),
			path: '/stats/year/' + siteId,
			id: 'stats-year',
			period: 'year',
		},
	];

	return filters;
}

export default {
	resetFirstView( context ) {
		context.store.dispatch( savePreference( 'firstViewHistory', [] ) );
	},

	redirectToDefaultSitePage: function( context, next ) {
		const siteFragment = getSiteFragment( context.path );

		if ( siteFragment ) {
			// if we are redirecting we need to retain our intended layout-focus
			const currentLayoutFocus = getCurrentLayoutFocus( context.store.getState() );
			context.store.dispatch( setNextLayoutFocus( currentLayoutFocus ) );
			page.redirect( getStatsDefaultSitePage( siteFragment ) );
		} else {
			next();
		}
	},

	insights: function( context, next ) {
		const basePath = sectionify( context.path );

		analytics.pageView.record( basePath, analyticsPageTitle + ' > Insights' );

		context.primary = <StatsInsights followList={ new FollowList() } />;
		next();
	},

	overview: function( context, next ) {
		const filters = function() {
			return [
				{
					title: i18n.translate( 'Days' ),
					path: '/stats/day',
					altPaths: [ '/stats' ],
					id: 'stats-day',
					period: 'day',
				},
				{ title: i18n.translate( 'Weeks' ), path: '/stats/week', id: 'stats-week', period: 'week' },
				{
					title: i18n.translate( 'Months' ),
					path: '/stats/month',
					id: 'stats-month',
					period: 'month',
				},
				{ title: i18n.translate( 'Years' ), path: '/stats/year', id: 'stats-year', period: 'year' },
			];
		};
		const basePath = sectionify( context.path );

		window.scrollTo( 0, 0 );

		const activeFilter = find( filters(), filter => {
			return (
				context.pathname === filter.path ||
				( filter.altPaths && -1 !== filter.altPaths.indexOf( context.pathname ) )
			);
		} );

		// Validate that date filter is legit
		if ( ! activeFilter ) {
			return next();
		}

		analytics.mc.bumpStat( 'calypso_stats_overview_period', activeFilter.period );
		analytics.pageView.record(
			basePath,
			analyticsPageTitle + ' > ' + titlecase( activeFilter.period )
		);

		context.primary = <StatsOverview period={ activeFilter.period } path={ context.pathname } />;
		next();
	},

	site: function( context, next ) {
		const { params: { site_id: givenSiteId }, path, query: queryOptions, store } = context;
		const filters = getSiteFilters( givenSiteId );
		const basePath = sectionify( path );
		const state = store.getState();
		const currentSite = getSite( state, givenSiteId );
		const siteId = currentSite ? currentSite.ID || 0 : 0;

		const activeFilter = find(
			filters,
			filter =>
				context.pathname === filter.path ||
				( filter.altPaths && -1 !== filter.altPaths.indexOf( context.pathname ) )
		);

		if ( ! activeFilter ) {
			return next();
		}

		const gmtOffset = getSiteOption( state, siteId, 'gmt_offset' );
		const momentSiteZone = i18n.moment().utcOffset( Number.isFinite( gmtOffset ) ? gmtOffset : 0 );
		const isValidStartDate =
			queryOptions.startDate && i18n.moment( queryOptions.startDate ).isValid();

		const date = isValidStartDate
			? i18n.moment( queryOptions.startDate ).locale( 'en' )
			: rangeOfPeriod( activeFilter.period, momentSiteZone.locale( 'en' ) ).startOf;

		const parsedPeriod = isValidStartDate
			? parseInt( getNumPeriodAgo( momentSiteZone, date, activeFilter.period ), 10 )
			: 0;

		// eslint-disable-next-line no-nested-ternary
		const numPeriodAgo = parsedPeriod ? ( parsedPeriod > 9 ? '10plus' : '-' + parsedPeriod ) : '';
		const baseAnalyticsPath = basePath + '/:site';

		analytics.mc.bumpStat( 'calypso_stats_site_period', activeFilter.period + numPeriodAgo );
		analytics.pageView.record(
			baseAnalyticsPath,
			analyticsPageTitle + ' > ' + titlecase( activeFilter.period )
		);
		recordPlaceholdersTiming();

		context.primary = (
			<StatsSite
				path={ context.pathname }
				date={ date }
				chartTab={ queryOptions.tab || 'views' }
				context={ context }
				period={ rangeOfPeriod( activeFilter.period, date ) }
			/>
		);

		next();
	},

	summary: function( context, next ) {
		let siteId = context.params.site_id;
		const siteFragment = getSiteFragment( context.path );
		const queryOptions = context.query;
		const contextModule = context.params.module;
		const filters = [
			{
				path: '/stats/' + contextModule + '/' + siteId,
				altPaths: [ '/stats/day/' + contextModule + '/' + siteId ],
				id: 'stats-day',
				period: 'day',
			},
			{ path: '/stats/week/' + contextModule + '/' + siteId, id: 'stats-week', period: 'week' },
			{ path: '/stats/month/' + contextModule + '/' + siteId, id: 'stats-month', period: 'month' },
			{ path: '/stats/year/' + contextModule + '/' + siteId, id: 'stats-year', period: 'year' },
		];

		const validModules = [
			'posts',
			'referrers',
			'clicks',
			'countryviews',
			'authors',
			'videoplays',
			'videodetails',
			'podcastdownloads',
			'searchterms',
			'annualstats',
		];
		let momentSiteZone = i18n.moment();
		const basePath = sectionify( context.path );

		const site = getSite( context.store.getState(), siteId );
		siteId = site ? site.ID || 0 : 0;

		const activeFilter = find( filters, filter => {
			return (
				context.pathname === filter.path ||
				( filter.altPaths && -1 !== filter.altPaths.indexOf( context.pathname ) )
			);
		} );

		if ( siteFragment && 0 === siteId ) {
			// site is not in the user's site list
			return ( window.location = '/stats' );
		}

		if ( ! activeFilter || -1 === validModules.indexOf( context.params.module ) ) {
			return next();
		}

		const gmtOffset = getSiteOption( context.store.getState(), siteId, 'gmt_offset' );
		if ( Number.isFinite( gmtOffset ) ) {
			momentSiteZone = i18n.moment().utcOffset( gmtOffset );
		}
		const isValidStartDate =
			queryOptions.startDate && i18n.moment( queryOptions.startDate ).isValid();
		const date = isValidStartDate
			? i18n.moment( queryOptions.startDate )
			: momentSiteZone.endOf( activeFilter.period );
		const period = rangeOfPeriod( activeFilter.period, date );

		const extraProps =
			context.params.module === 'videodetails' ? { postId: parseInt( queryOptions.post, 10 ) } : {};

		let statsQueryOptions = {};

		// All Time Summary Support
		if ( queryOptions.summarize && queryOptions.num ) {
			statsQueryOptions = pick( queryOptions, [ 'num', 'summarize' ] );
			statsQueryOptions.period = 'day';
		}

		analytics.pageView.record(
			basePath,
			analyticsPageTitle +
				' > ' +
				titlecase( activeFilter.period ) +
				' > ' +
				titlecase( context.params.module )
		);

		context.primary = (
			<StatsSummary
				path={ context.pathname }
				statsQueryOptions={ statsQueryOptions }
				date={ date }
				context={ context }
				period={ period }
				{ ...extraProps }
			/>
		);

		next();
	},

	post: function( context, next ) {
		let siteId = context.params.site_id;
		const postId = parseInt( context.params.post_id, 10 );
		const pathParts = context.path.split( '/' );
		const postOrPage = pathParts[ 2 ] === 'post' ? 'post' : 'page';

		const site = getSite( context.store.getState(), siteId );
		siteId = site ? site.ID || 0 : 0;

		if ( 0 === siteId ) {
			window.location = '/stats';
			return next();
		}

		analytics.pageView.record(
			'/stats/' + postOrPage + '/:post_id/:site',
			analyticsPageTitle + ' > Single ' + titlecase( postOrPage )
		);

		context.primary = (
			<StatsPostDetail path={ context.path } postId={ postId } context={ context } />
		);

		next();
	},

	follows: function( context, next ) {
		let siteId = context.params.site_id;
		let pageNum = context.params.page_num;
		const followList = new FollowList();
		const basePath = sectionify( context.path );

		const site = getSite( context.store.getState(), siteId );
		siteId = site ? site.ID || 0 : 0;

		const siteDomain =
			site && typeof site.slug !== 'undefined' ? site.slug : getSiteFragment( context.path );

		if ( 0 === siteId ) {
			window.location = '/stats';
			return next();
		}

		pageNum = parseInt( pageNum, 10 );

		if ( ! pageNum || pageNum < 1 ) {
			pageNum = 1;
		}

		analytics.pageView.record(
			basePath.replace( '/' + pageNum, '' ),
			analyticsPageTitle + ' > Followers > Comment'
		);

		context.primary = (
			<StatsCommentFollows
				path={ context.path }
				page={ pageNum }
				perPage="20"
				total="10"
				domain={ siteDomain }
				siteId={ siteId }
				followList={ followList }
			/>
		);

		next();
	},

	activityLog: function( context, next ) {
		const state = context.store.getState();
		const siteId = getSelectedSiteId( state );
		const startDate = i18n.moment( context.query.startDate, 'YYYY-MM-DD' ).isValid()
			? context.query.startDate
			: undefined;

		analytics.pageView.record( '/stats/activity/:site', analyticsPageTitle + ' > Activity ' );

		context.primary = (
			<ActivityLog
				path={ context.path }
				siteId={ siteId }
				context={ context }
				startDate={ startDate }
			/>
		);

		next();
	},
};
