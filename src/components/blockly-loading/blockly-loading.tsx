import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { Loader } from '@deriv-com/ui';

const BlocklyLoading = observer(() => {
    const { blockly_store } = useStore();
    const { is_loading } = blockly_store;

    useEffect(() => {
        if (!is_loading || !window.location.hostname.includes('profitdock.site')) {
            return undefined;
        }

        const timeout = window.setTimeout(() => {
            console.error('[Blockly] Workspace bootstrap timed out. Hiding blocking overlay for ProfitDock shell.');
            blockly_store.setLoading(false);
        }, 3000);

        return () => {
            window.clearTimeout(timeout);
        };
    }, [blockly_store, is_loading]);

    return (
        <>
            {is_loading && (
                <div className='bot__loading' data-testid='blockly-loader'>
                    <Loader />
                    <div>Loading Blockly...</div>
                </div>
            )}
        </>
    );
});

export default BlocklyLoading;
