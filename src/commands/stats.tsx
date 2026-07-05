import {Text} from 'ink';
import {useState, useEffect} from 'react';
import {z} from 'zod';
import {requireToken} from '../lib/auth.js';
import {createApiClient} from '../lib/api.js';
import {parseRelativeTime} from '../lib/time.js';
import {handleError} from '../lib/errors.js';
import {isJsonMode, jsonOutput} from '../lib/output.js';
import {StatsResponseSchema, StatsSummaryResponseSchema} from '../types/log.js';
import StatsView from '../components/StatsView.js';

export const options = z.object({
	from: z.string().default('24h').describe('Start time (e.g., 24h, 7d)'),
	to: z.string().optional().describe('End time'),
	'group-by': z.enum(['hour', 'day', 'source']).default('day').describe('Group by: hour, day, source'),
	source: z.string().optional().describe('Filter by source'),
	env: z.string().optional().describe('Filter by environment'),
	dataset: z.string().optional().describe('Filter by dataset'),
	json: z.boolean().default(false).describe('Output as JSON'),
	verbose: z.boolean().default(false).describe('Show debug info'),
});

type Props = {
	options: z.infer<typeof options>;
};

type StatsData = {
	stats: unknown[];
	totals: {debug: number; info: number; warn: number; error: number; total: number};
	period: {from: string; to: string; groupBy: string};
	comparison?: {yesterdayTotal: number; changePercent: number; trend: 'up' | 'down' | 'stable'};
	groupBySource?: Array<{source: string; total: number; debug: number; info: number; warn: number; error: number}>;
};

function toDateString(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

export default function Stats({options: flags}: Props) {
	const [data, setData] = useState<StatsData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const json = isJsonMode(flags);

	useEffect(() => {
		void fetchStats();
	}, []);

	async function fetchStats() {
		try {
			const token = requireToken();
			const client = createApiClient({token, verbose: flags.verbose});

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

			let comparison: StatsData['comparison'];
			if (summaryResponse?.today !== undefined && summaryResponse?.yesterday !== undefined) {
				const yesterdayTotal = summaryResponse.yesterday;
				const todayTotal = summaryResponse.today;
				const changePercent = yesterdayTotal > 0
					? ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100
					: 0;
				const trend = changePercent > 1 ? 'up' as const : changePercent < -1 ? 'down' as const : 'stable' as const;
				comparison = {yesterdayTotal, changePercent, trend};
			}

			let groupBySource: StatsData['groupBySource'];
			if (flags['group-by'] === 'source' && Array.isArray(statsResponse.stats)) {
				groupBySource = statsResponse.stats as StatsData['groupBySource'];
			}

			const result: StatsData = {
				stats: statsResponse.stats,
				totals,
				period: {from: fromDate, to: toDate, groupBy: flags['group-by']},
				comparison,
				groupBySource,
			};

			if (json) {
				jsonOutput(result);
			}

			setData(result);
		} catch (err) {
			if (json) {
				handleError(err, true);
			}

			setError(err instanceof Error ? err.message : String(err));
		}
	}

	if (json) {
		return null;
	}

	if (error) {
		return <Text color="red">✗ {error}</Text>;
	}

	if (!data) {
		return <Text color="yellow">Fetching stats...</Text>;
	}

	return (
		<StatsView
			totals={data.totals}
			period={flags.from}
			comparison={data.comparison}
			groupBySource={data.groupBySource}
		/>
	);
}
