import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { load, save_types } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import './free-bots.scss';

interface Bot {
    description: string;
    fileName: string;
    id: string;
    name: string;
}

const BEST_BOTS: Bot[] = [
    {
        id: 'money8gg-speed-bot',
        name: 'Speed Bot',
        description: 'A Bot that can be used in Any Market and has speed.',
        fileName: 'money8gg-speed-bot.xml',
    },
    {
        id: 'under-8-under-5',
        name: 'Under 8 Under 5',
        description:
            'In order to use this Bot please look for a market where 8 and 9 are below 10.5% and atleast 3 digits below 5 are above 10%',
        fileName: 'under-8-under-5.xml',
    },
    {
        id: 'ai-trading-bot',
        name: 'AI Trading Bot',
        description: 'An AI-powered trading bot that uses prediction lists for smart trading',
        fileName: 'ai-trading-bot.xml',
    },
    {
        id: 'ai-under-7-bot',
        name: 'AI Under 7 Bot',
        description: 'An AI-powered trading bot for over under markets',
        fileName: 'ai-under-7-bot.xml',
    },
    {
        id: 'ai-over-1-bot',
        name: 'AI Over 1 Bot',
        description: 'An AI-powered trading bot for over 1 that waits for entries',
        fileName: 'ai-over-1-bot.xml',
    },
    {
        id: 'ai-under-8-bot',
        name: 'AI Under 8 Bot',
        description: 'An AI-powered trading bot for under 8 that waits for entries',
        fileName: 'ai-under-8-bot.xml',
    },
    {
        id: 'under-8-strategy',
        name: 'Under 8 Strategy',
        description:
            'An AI-powered under 8 bot, that requires you need is to check AI Analysis if the 8 and 9 % are less than 10 % for the last 20 ticks and over 4 is above 50% run the bot',
        fileName: 'under-8-strategy.xml',
    },
    {
        id: 'over-3-strategy',
        name: 'Over 3 Strategy',
        description:
            'An AI-powered Over 3 bot, that requires you need is to check DAnalysis if the 0 and 1 and 3 are less than 10 % for the last 1000 ticks',
        fileName: 'over-3-strategy.xml',
    },
    {
        id: 'under-7-bulk',
        name: 'Under 7 Bulk',
        description:
            'A Bot that waits for 2 digits under 7 and 1 above and takes multiple identical under 7 trades simultaneously (configurable count).',
        fileName: 'under-7-bulk.xml',
    },
    {
        id: 'percentage-auto-even-odd',
        name: 'Percentage Auto Even/Odd',
        description: 'A Bot that trades even/odd if a particular percentage is hit',
        fileName: 'percentage-auto-even-odd.xml',
    },
    {
        id: 'ai-with-entry-point',
        name: 'AI with Entry Point',
        description:
            'An AI trading bot that lets you define entry points and martingale multipliers for strategic trading',
        fileName: 'ai-with-entry-point.xml',
    },
    {
        id: 'accumulators-barrier-bot',
        name: 'Accumulators Barrier Bot',
        description: 'An accumulators bot that exits after every 4 ticks',
        fileName: 'accumulators-barrier-bot.xml',
    },
];

const FreeBots = observer(() => {
    const { dashboard, app } = useStore();
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [loadingBotId, setLoadingBotId] = useState<string | null>(null);

    const waitForWorkspace = async () => {
        const existingWorkspace = (window as any).Blockly?.derivWorkspace;
        if (existingWorkspace) {
            return existingWorkspace;
        }

        dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
        window.location.hash = 'bot_builder';

        return new Promise<any>((resolve, reject) => {
            const timeout_at = Date.now() + 12000;

            const checkWorkspace = () => {
                const workspace = (window as any).Blockly?.derivWorkspace;

                if (workspace) {
                    resolve(workspace);
                    return;
                }

                if (Date.now() >= timeout_at) {
                    reject(new Error('Bot Builder is not ready yet. Please try again.'));
                    return;
                }

                window.setTimeout(checkWorkspace, 80);
            };

            checkWorkspace();
        });
    };

    const loadBot = async (bot: Bot) => {
        try {
            setErrorMessage(null);
            setLoadingBotId(bot.id);

            const response = await fetch(`/bots/${bot.fileName}`);

            if (!response.ok) {
                throw new Error('Failed to fetch bot file.');
            }

            const xmlContent = await response.text();
            const workspace = await waitForWorkspace();

            await load({
                block_string: xmlContent,
                file_name: bot.name,
                workspace,
                from: save_types.LOCAL,
                drop_event: null,
                strategy_id: null,
                showIncompatibleStrategyDialog: null,
            });

            if (workspace) {
                workspace.strategy_to_load = xmlContent;
            }

            void app.refreshTradeDefinitionBlocks?.();

            dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
            window.location.hash = 'bot_builder';
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Unable to load that bot right now.');
        } finally {
            setLoadingBotId(null);
        }
    };

    return (
        <div className='free-bots'>
            <div className='free-bots__shell'>
                <header className='free-bots__hero'>
                    <div className='free-bots__eyebrow'>Free Bots</div>
                    <h1 className='free-bots__title'>Best Bots</h1>
                    <p className='free-bots__subtitle'>
                        Discover our top-performing trading bots designed for maximum profitability.
                    </p>
                </header>

                {errorMessage && <div className='free-bots__error'>{errorMessage}</div>}

                <section className='free-bots__table' aria-label='Best bots table'>
                    <div className='free-bots__table-head'>
                        <div>Bot Name</div>
                        <div>Description</div>
                        <div>Action</div>
                    </div>

                    <div className='free-bots__table-body'>
                        {BEST_BOTS.map(bot => (
                            <article key={bot.id} className='free-bots__row'>
                                <div className='free-bots__cell free-bots__cell--name'>
                                    <span className='free-bots__mobile-label'>Bot Name</span>
                                    <strong>{bot.name}</strong>
                                </div>

                                <div className='free-bots__cell free-bots__cell--description'>
                                    <span className='free-bots__mobile-label'>Description</span>
                                    <p>{bot.description}</p>
                                </div>

                                <div className='free-bots__cell free-bots__cell--action'>
                                    <span className='free-bots__mobile-label'>Action</span>
                                    <button
                                        type='button'
                                        className='free-bots__load-button'
                                        onClick={() => void loadBot(bot)}
                                        disabled={loadingBotId === bot.id}
                                    >
                                        {loadingBotId === bot.id ? 'LOADING' : 'LOAD'}
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
});

export default FreeBots;
