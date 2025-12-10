import * as Blockly from 'blockly';
import { javascriptGenerator } from 'blockly/javascript';

export const initBlocklyGenerators = () => {
    // Initialize the generator


    // Trade Parameters Block Generator
    // @ts-ignore
    javascriptGenerator.forBlock['trade_parameters'] = function (block: any, generator: any) {
        return '';
    };

    // Execute Trade Block Generator
    // @ts-ignore
    javascriptGenerator.forBlock['execute_trade'] = function (block: any, generator: any) {
        const type = block.getFieldValue('TYPE');
        return `
        await bot.purchase('${type}');
        `;
    };

    // Purchase Condition Block Generator
    // @ts-ignore
    javascriptGenerator.forBlock['purchase_condition'] = function (block: any, generator: any) {
        const type = block.getFieldValue('TYPE');
        const statements_conditions = generator.statementToCode(block, 'CONDITIONS');

        return `
        // Purchase Condition (${type})
        ${statements_conditions}
        `;
    };

    // RSI Indicator Block
    // @ts-ignore
    javascriptGenerator.forBlock['indicator_rsi'] = function (block: any, generator: any) {
        const operator = block.getFieldValue('OPERATOR');
        const value = block.getFieldValue('VALUE');
        const code = `bot.rsi(14) ${operator} ${value}`;
        const order = generator.ORDER_RELATIONAL || 0;
        return [code, order];
    };

    // Moving Average Block
    // @ts-ignore
    javascriptGenerator.forBlock['indicator_ma'] = function (block: any, generator: any) {
        const period = block.getFieldValue('PERIOD');
        const condition = block.getFieldValue('CONDITION');

        let code = 'false';
        if (condition === 'ABOVE') code = `bot.getTick() > bot.sma(${period})`;
        if (condition === 'BELOW') code = `bot.getTick() < bot.sma(${period})`;
        if (condition === 'CROSS_UP') code = `bot.getTick() > bot.sma(${period})`;
        if (condition === 'CROSS_DOWN') code = `bot.getTick() < bot.sma(${period})`;

        const order = generator.ORDER_RELATIONAL || 0;
        return [code, order];
    };

    // Sell Condition Block
    // @ts-ignore
    javascriptGenerator.forBlock['sell_condition'] = function (block: any, generator: any) {
        const statements_conditions = generator.statementToCode(block, 'CONDITIONS');
        return `
         if (bot.isTradeOpen()) {
             ${statements_conditions}
         }
         `;
    };

    // Restart Trading Block
    // @ts-ignore
    javascriptGenerator.forBlock['restart_trading'] = function (block: any, generator: any) {
        return '';
    };
};
