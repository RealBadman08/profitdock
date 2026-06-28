import { ComponentProps, ReactNode, useMemo } from 'react';
import { SOCIAL_LINKS } from '@/features/deriv-live/constants';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import {
    LegacyResponsibleTradingIcon,
    LegacyTheme1pxIcon,
    LegacyWhatsappIcon,
} from '@deriv/quill-icons/Legacy';
import { useTranslations } from '@deriv-com/translations';
import { ToggleSwitch } from '@deriv-com/ui';

type TMenuConfig = {
    LeftComponent: React.ElementType;
    RightComponent?: ReactNode;
    as: 'a' | 'button';
    href?: string;
    id?: string;
    label: ReactNode;
    onClick?: () => void;
    removeBorderBottom?: boolean;
    target?: ComponentProps<'a'>['target'];
    isActive?: boolean;
}[];

const RESPONSIBLE_TRADING_URL = 'https://deriv.com/responsible-trading/';

const useMobileMenuConfig = () => {
    const { localize } = useTranslations();
    const { is_dark_mode_on, toggleTheme } = useThemeSwitcher();

    const menuConfig = useMemo(
        (): TMenuConfig[] => [
            [
                {
                    as: 'button',
                    label: localize('Dark theme'),
                    LeftComponent: LegacyTheme1pxIcon,
                    RightComponent: <ToggleSwitch value={is_dark_mode_on} onChange={toggleTheme} />,
                },
                {
                    as: 'a',
                    href: RESPONSIBLE_TRADING_URL,
                    label: localize('Responsible trading'),
                    LeftComponent: LegacyResponsibleTradingIcon,
                    target: '_blank',
                },
                {
                    as: 'a',
                    href: SOCIAL_LINKS.whatsapp,
                    id: 'whatsapp',
                    label: localize('WhatsApp'),
                    LeftComponent: LegacyWhatsappIcon,
                    target: '_blank',
                    removeBorderBottom: true,
                },
            ],
        ],
        [is_dark_mode_on, localize, toggleTheme]
    );

    return {
        config: menuConfig,
    };
};

export default useMobileMenuConfig;
