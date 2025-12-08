export interface BotTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  xml: string;
}

export const botTemplates: BotTemplate[] = [
  {
    id: "martingale",
    name: "Martingale Strategy",
    description: "Double your stake after each loss to recover losses and gain profit",
    category: "free",
    xml: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="trade_parameters" x="20" y="20">
    <value name="MARKET">
      <block type="text">
        <field name="TEXT">R_100</field>
      </block>
    </value>
    <value name="STAKE">
      <block type="math_number">
        <field name="NUM">1</field>
      </block>
    </value>
    <value name="DURATION">
      <block type="math_number">
        <field name="NUM">5</field>
      </block>
    </value>
  </block>
  <block type="purchase_condition" x="20" y="140">
    <field name="TYPE">CALL</field>
  </block>
  <block type="restart_trading" x="20" y="220">
    <field name="CONDITION">LOSS</field>
  </block>
</xml>`,
  },
  {
    id: "rsi_strategy",
    name: "RSI Strategy",
    description: "Trade based on RSI overbought/oversold signals",
    category: "free",
    xml: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="trade_parameters" x="20" y="20">
    <value name="MARKET">
      <block type="text">
        <field name="TEXT">R_100</field>
      </block>
    </value>
    <value name="STAKE">
      <block type="math_number">
        <field name="NUM">1</field>
      </block>
    </value>
    <value name="DURATION">
      <block type="math_number">
        <field name="NUM">5</field>
      </block>
    </value>
  </block>
  <block type="purchase_condition" x="20" y="140">
    <field name="TYPE">CALL</field>
    <statement name="CONDITIONS">
      <block type="indicator_rsi">
        <field name="OPERATOR">&lt;</field>
        <field name="VALUE">30</field>
      </block>
    </statement>
  </block>
  <block type="purchase_condition" x="20" y="260">
    <field name="TYPE">PUT</field>
    <statement name="CONDITIONS">
      <block type="indicator_rsi">
        <field name="OPERATOR">&gt;</field>
        <field name="VALUE">70</field>
      </block>
    </statement>
  </block>
</xml>`,
  },
  {
    id: "trend_following",
    name: "Trend Following",
    description: "Follow market trends using moving average crossovers",
    category: "free",
    xml: `<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="trade_parameters" x="20" y="20">
    <value name="MARKET">
      <block type="text">
        <field name="TEXT">R_100</field>
      </block>
    </value>
    <value name="STAKE">
      <block type="math_number">
        <field name="NUM">1</field>
      </block>
    </value>
    <value name="DURATION">
      <block type="math_number">
        <field name="NUM">5</field>
      </block>
    </value>
  </block>
  <block type="purchase_condition" x="20" y="140">
    <field name="TYPE">CALL</field>
    <statement name="CONDITIONS">
      <block type="indicator_ma">
        <field name="PERIOD">14</field>
        <field name="CONDITION">CROSS_UP</field>
      </block>
    </statement>
  </block>
  <block type="purchase_condition" x="20" y="260">
    <field name="TYPE">PUT</field>
    <statement name="CONDITIONS">
      <block type="indicator_ma">
        <field name="PERIOD">14</field>
        <field name="CONDITION">CROSS_DOWN</field>
      </block>
    </statement>
  </block>
  <block type="restart_trading" x="20" y="380">
    <field name="CONDITION">BOTH</field>
  </block>
</xml>`,
  },
];
