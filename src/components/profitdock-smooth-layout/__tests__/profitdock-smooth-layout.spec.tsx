import { render, screen } from '@testing-library/react';
import { ProfitDockSmoothHero, ProfitDockSmoothPage, ProfitDockSmoothSection } from '..';

describe('ProfitDock smooth layout primitives', () => {
    it('renders page, hero, and section content with stable layout classes', () => {
        render(
            <ProfitDockSmoothPage maxWidth='72rem'>
                <ProfitDockSmoothHero eyebrow='Free Bots' title='Best Bots' description='Curated bot list' />
                <ProfitDockSmoothSection ariaLabel='Bot catalogue'>
                    <button type='button'>Load bot</button>
                </ProfitDockSmoothSection>
            </ProfitDockSmoothPage>
        );

        expect(screen.getByText('Free Bots')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Best Bots' })).toBeInTheDocument();
        expect(screen.getByLabelText('Bot catalogue')).toHaveClass('profitdock-smooth-section');
        expect(screen.getByRole('button', { name: 'Load bot' })).toBeInTheDocument();
    });
});
