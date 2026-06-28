import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { DigitCircleBoard, ModuleCard } from '@/features/deriv-live/components';
import '@/features/deriv-live/deriv-live.scss';
import { getDefaultMarketSymbol } from '@/features/deriv-live/api';
import {
    DEFAULT_ANALYSIS_DIGIT,
    DEFAULT_MARKET_SYMBOL,
    DEFAULT_TICK_COUNT,
} from '@/features/deriv-live/constants';
import { useLiveTickFeed } from '@/features/deriv-live/useLiveTickFeed';
import './analysis-tool.scss';

const AnalysisTool = observer(() => {
    const [selectedMarket, setSelectedMarket] = useState(DEFAULT_MARKET_SYMBOL);
    const [tickCount, setTickCount] = useState(DEFAULT_TICK_COUNT);
    const [tickCountInput, setTickCountInput] = useState(String(DEFAULT_TICK_COUNT));
    const [analysisDigit, setAnalysisDigit] = useState(DEFAULT_ANALYSIS_DIGIT);

    const liveFeed = useLiveTickFeed({
        analysisDigit,
        symbol: selectedMarket,
        tickCount,
    });

    useEffect(() => {
        if (!liveFeed.markets.length) {
            return;
        }

        if (!liveFeed.markets.some(market => market.symbol === selectedMarket)) {
            setSelectedMarket(getDefaultMarketSymbol(liveFeed.markets));
        }
    }, [liveFeed.markets, selectedMarket]);

    useEffect(() => {
        setTickCountInput(String(tickCount));
    }, [tickCount]);

    const handleTickCountChange = (value: string) => {
        const digits_only = value.replace(/\D/g, '').slice(0, 4);
        setTickCountInput(digits_only);

        if (!digits_only) {
            return;
        }

        const parsed_value = Number(digits_only);
        if (parsed_value >= 1 && parsed_value <= 1000) {
            setTickCount(parsed_value);
        }
    };

    const handleTickCountBlur = () => {
        if (!tickCountInput) {
            setTickCountInput(String(tickCount));
            return;
        }

        const clamped_value = Math.min(1000, Math.max(1, Number(tickCountInput)));
        setTickCount(clamped_value);
        setTickCountInput(String(clamped_value));
    };

    return (
        <div className='deriv-live deriv-live--analysis'>
            <div className='deriv-live__stack'>
                <section className='deriv-live__hero deriv-live__hero--analysis'>
                    <div className='deriv-live__control-grid deriv-live__control-grid--analysis'>
                        <div className='deriv-live__field'>
                            <label htmlFor='analysis-market'>Market</label>
                            <select
                                id='analysis-market'
                                value={selectedMarket}
                                onChange={event => setSelectedMarket(event.target.value)}
                            >
                                {liveFeed.markets.map(market => (
                                    <option key={market.symbol} value={market.symbol}>
                                        {market.display_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className='deriv-live__field'>
                            <label htmlFor='analysis-ticks'>Ticks</label>
                            <input
                                id='analysis-ticks'
                                type='text'
                                inputMode='numeric'
                                pattern='[0-9]*'
                                value={tickCountInput}
                                onBlur={handleTickCountBlur}
                                onChange={event => handleTickCountChange(event.target.value)}
                                onFocus={event => event.target.select()}
                            />
                        </div>
                        <div className='deriv-live__field'>
                            <label htmlFor='analysis-digit'>Barrier digit</label>
                            <select
                                id='analysis-digit'
                                value={analysisDigit}
                                onChange={event => setAnalysisDigit(Number(event.target.value))}
                            >
                                {Array.from({ length: 10 }, (_, digit) => (
                                    <option key={digit} value={digit}>
                                        {digit}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className='deriv-live__field'>
                            <label>Current price</label>
                            <input value={liveFeed.priceDisplay} readOnly />
                        </div>
                    </div>
                    {liveFeed.error && <div className='deriv-live__notice'>{liveFeed.error}</div>}
                </section>

                <DigitCircleBoard
                    analytics={liveFeed.analytics}
                    hideDescription
                    highlightExtremes
                    showRecentDigits={false}
                    showTickCounts={false}
                />

                {liveFeed.analytics && (
                    <div className='deriv-live__double-grid'>
                        <ModuleCard title='Even / Odd Analysis' summary={liveFeed.analytics.evenOdd} />
                        <ModuleCard title='Rise / Fall Analysis' summary={liveFeed.analytics.riseFall} />
                        <ModuleCard
                            title='Over / Under Analysis'
                            summary={liveFeed.analytics.overUnder}
                            selector={
                                <div className='deriv-live__digit-picker'>
                                    {Array.from({ length: 10 }, (_, digit) => (
                                        <button
                                            key={digit}
                                            className={`deriv-live__digit-button ${analysisDigit === digit ? 'deriv-live__digit-button--active' : ''}`}
                                            onClick={() => setAnalysisDigit(digit)}
                                            type='button'
                                        >
                                            {digit}
                                        </button>
                                    ))}
                                </div>
                            }
                        />
                        <ModuleCard title='Matches / Differs Analysis' summary={liveFeed.analytics.matchesDiffers} />
                    </div>
                )}
            </div>
        </div>
    );
});

export default AnalysisTool;
