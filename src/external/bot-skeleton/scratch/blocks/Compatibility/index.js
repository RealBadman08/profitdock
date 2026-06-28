import { localize } from '@deriv-com/translations';
import { modifyContextMenu } from '../../utils';

const cloneGenerator = (source_type, target_type) => {
    const source_generator = window.Blockly.JavaScript.javascriptGenerator.forBlock[source_type];

    if (source_generator) {
        window.Blockly.JavaScript.javascriptGenerator.forBlock[target_type] = block => source_generator(block);
    }
};

window.Blockly.Blocks.money8gg_print = {
    ...window.Blockly.Blocks.text_print,
    meta() {
        return {
            display_name: localize('Money8GG print'),
            description: localize('Compatibility block for imported bots that print a message.'),
        };
    },
};

window.Blockly.Blocks.money8gg_notify = {
    ...window.Blockly.Blocks.notify,
    meta() {
        return {
            display_name: localize('Money8GG notify'),
            description: localize('Compatibility block for imported bots that show a journal notification.'),
        };
    },
};

window.Blockly.Blocks.one_s_markets = {
    init() {
        this.jsonInit({
            message0: localize('1s market {{ input_market }}', {
                input_market: '%1',
            }),
            args0: [
                {
                    type: 'field_dropdown',
                    name: 'MARKET_LIST',
                    options: [
                        [localize('Disable'), 'disable'],
                        [localize('Volatility 10 (1s) Index'), '1HZ10V'],
                        [localize('Volatility 15 (1s) Index'), '1HZ15V'],
                        [localize('Volatility 25 (1s) Index'), '1HZ25V'],
                        [localize('Volatility 30 (1s) Index'), '1HZ30V'],
                        [localize('Volatility 50 (1s) Index'), '1HZ50V'],
                        [localize('Volatility 75 (1s) Index'), '1HZ75V'],
                        [localize('Volatility 90 (1s) Index'), '1HZ90V'],
                        [localize('Volatility 100 (1s) Index'), '1HZ100V'],
                    ],
                },
            ],
            colour: window.Blockly.Colours.Special1.colour,
            colourSecondary: window.Blockly.Colours.Special1.colourSecondary,
            colourTertiary: window.Blockly.Colours.Special1.colourTertiary,
            previousStatement: null,
            nextStatement: null,
            tooltip: localize('Compatibility block for bots that switch between 1-second synthetic markets.'),
            category: window.Blockly.Categories.Miscellaneous,
        });
    },
    customContextMenu(menu) {
        modifyContextMenu(menu);
    },
    meta() {
        return {
            display_name: localize('1s market'),
            description: localize('Switches the running bot to the selected 1-second market.'),
        };
    },
};

cloneGenerator('text_print', 'money8gg_print');
cloneGenerator('notify', 'money8gg_notify');

window.Blockly.JavaScript.javascriptGenerator.forBlock.one_s_markets = block => {
    const symbol = block.getFieldValue('MARKET_LIST');
    return `Bot.switchOneSMarket('${symbol}');\n`;
};
