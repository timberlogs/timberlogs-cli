import {useEffect} from 'react';
import type {ReactNode} from 'react';
import {createApiClient} from '../../lib/api.js';
import {parseRelativeTime} from '../../lib/time.js';
import {StatsResponseSchema, StatsSummaryResponseSchema} from '../../types/log.js';
import StatsView from '../StatsView.js';

type StatsFlags = {
	from: string;
	to?: string;
	'group-by': 'hour' | 'day' | 'source';
	source?: string;
	env?: string;
	dataset?: string;
};

type Props = {
	flags: StatsFlags;
	token: string;
	onBack: () => void;
	onDone: (output: ReactNode, interactive: boolean) => void;
	onError: (message: string) => void;
};

function toDateString(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

export default function StatsViewCmd({flags, token, onBack, onDone, onError}: Props) {
	useEffect(() => {
		void run();
	}, []);

	async function run() {
		try {
			const client = createApiClient({token});
			const fromMs = parseRelativeTime(flags.from);
			const toMs = flags.to ? parseRelativeTime(flags.to) : Date.now();
			const fromDate = toDateString(fromMs);
			const toDate = toDateString(toMs);

			const statsResponse = await client.get('/v1/stats', {
				from: fromDate,
				to: toDate,
				groupBy: flags['group-by'],
				source: flags.source,
				environment: flags.env,
				dataset: flags.dataset,
			}).then(raw => StatsResponseSchema.parse(raw));
			const summaryResponse = await client.get('/v1/stats/summary')
				.then(raw => StatsSummaryResponseSchema.parse(raw))
				.catch(() => null);

			const totals = {
				debug: (statsResponse.totals?.['debug'] as number) ?? 0,
				info: (statsResponse.totals?.['info'] as number) ?? 0,
				warn: (statsResponse.totals?.['warn'] as number) ?? 0,
				error: (statsResponse.totals?.['error'] as number) ?? 0,
				total: (statsResponse.totals?.['total'] as number) ?? 0,
			};

			let comparison: {yesterdayTotal: number; changePercent: number; trend: 'up' | 'down' | 'stable'} | undefined;
			if (summaryResponse?.today !== undefined && summaryResponse?.yesterday !== undefined) {
				const yesterdayTotal = summaryResponse.yesterday;
				const todayTotal = summaryResponse.today;
				const changePercent = yesterdayTotal > 0
					? ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100
					: 0;
				const trend = changePercent > 1 ? 'up' as const : changePercent < -1 ? 'down' as const : 'stable' as const;
				comparison = {yesterdayTotal, changePercent, trend};
			}

			let groupBySource: Array<{source: string; total: number; debug: number; info: number; warn: number; error: number}> | undefined;
			if (flags['group-by'] === 'source' && Array.isArray(statsResponse.stats)) {
				groupBySource = statsResponse.stats as typeof groupBySource;
			}

			onDone(
				<StatsView
					totals={totals}
					period={flags.from}
					comparison={comparison}
					groupBySource={groupBySource}
					onBack={onBack}
				/>,
				true,
			);
		} catch (err) {
			onError(err instanceof Error ? err.message : String(err));
		}
	}

	return null;
}
