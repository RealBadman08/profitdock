import { useEffect, useRef } from "react";
import * as Blockly from "blockly";

// Define custom trading blocks
const defineCustomBlocks = () => {
  // Trade Parameters Block
  Blockly.Blocks['trade_parameters'] = {
    init: function () {
      this.appendDummyInput()
        .appendField("Trade Parameters");
      this.appendValueInput("MARKET")
        .setCheck("String")
        .appendField("Market:");
      this.appendValueInput("STAKE")
        .setCheck("Number")
        .appendField("Stake:");
      this.appendValueInput("DURATION")
        .setCheck("Number")
        .appendField("Duration:");
      this.setColour(230);
      this.setTooltip("Set trading parameters");
      this.setHelpUrl("");
    }
  };

  // Purchase Condition Block
  Blockly.Blocks['purchase_condition'] = {
    init: function () {
      this.appendDummyInput()
        .appendField("Purchase when")
        .appendField(new Blockly.FieldDropdown([
          ["Rise", "CALL"],
          ["Fall", "PUT"],
          ["Higher", "CALLE"],
          ["Lower", "PUTE"]
        ]), "TYPE");
      this.appendStatementInput("CONDITIONS")
        .setCheck(null)
        .appendField("Conditions:");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(160);
      this.setTooltip("Define purchase conditions");
      this.setHelpUrl("");
    }
  };

  // RSI Indicator Block
  Blockly.Blocks['indicator_rsi'] = {
    init: function () {
      this.appendDummyInput()
        .appendField("RSI")
        .appendField(new Blockly.FieldDropdown([
          ["Greater than", ">"],
          ["Less than", "<"],
          ["Equal to", "=="]
        ]), "OPERATOR")
        .appendField(new Blockly.FieldNumber(70), "VALUE");
      this.setOutput(true, "Boolean");
      this.setColour(290);
      this.setTooltip("RSI indicator condition");
      this.setHelpUrl("");
    }
  };

  // Moving Average Block
  Blockly.Blocks['indicator_ma'] = {
    init: function () {
      this.appendDummyInput()
        .appendField("Moving Average")
        .appendField(new Blockly.FieldNumber(14), "PERIOD")
        .appendField(new Blockly.FieldDropdown([
          ["crosses above", "CROSS_UP"],
          ["crosses below", "CROSS_DOWN"],
          ["is above", "ABOVE"],
          ["is below", "BELOW"]
        ]), "CONDITION")
        .appendField("price");
      this.setOutput(true, "Boolean");
      this.setColour(290);
      this.setTooltip("Moving average condition");
      this.setHelpUrl("");
    }
  };

  // Sell Condition Block
  Blockly.Blocks['sell_condition'] = {
    init: function () {
      this.appendDummyInput()
        .appendField("Sell when");
      this.appendStatementInput("CONDITIONS")
        .setCheck(null);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(20);
      this.setTooltip("Define sell conditions");
      this.setHelpUrl("");
    }
  };

  // Restart Trading Block
  Blockly.Blocks['restart_trading'] = {
    init: function () {
      this.appendDummyInput()
        .appendField("Restart trading after")
        .appendField(new Blockly.FieldDropdown([
          ["Win", "WIN"],
          ["Loss", "LOSS"],
          ["Win or Loss", "BOTH"]
        ]), "CONDITION");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(120);
      this.setTooltip("Restart trading conditions");
      this.setHelpUrl("");
    }
  };
  // Execute Trade Block
  Blockly.Blocks['execute_trade'] = {
    init: function () {
      this.appendDummyInput()
        .appendField("Purchase Contract")
        .appendField(new Blockly.FieldDropdown([
          ["Call", "CALL"],
          ["Put", "PUT"],
          ["Digit Match", "DIGITMATCH"],
          ["Digit Differs", "DIGITDIFF"]
        ]), "TYPE");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(160);
      this.setTooltip("Execute a trade");
      this.setHelpUrl("");
    }
  };

  // Logic Boolean (Standard override if needed, but usually built-in)
};

interface BlocklyWorkspaceProps {
  onWorkspaceChange?: (xml: string) => void;
  initialXml?: string;
}

export default function BlocklyWorkspace({ onWorkspaceChange, initialXml }: BlocklyWorkspaceProps) {
  const blocklyDiv = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);

  useEffect(() => {
    if (!blocklyDiv.current) return;

    // Define custom blocks
    defineCustomBlocks();

    // Create toolbox
    const toolbox = {
      kind: "categoryToolbox",
      contents: [
        {
          kind: "category",
          name: "Trade Parameters",
          colour: "230",
          contents: [
            { kind: "block", type: "trade_parameters" },
          ],
        },
        {
          kind: "category",
          name: "Purchase Conditions",
          colour: "160",
          contents: [
            { kind: "block", type: "purchase_condition" },
            { kind: "block", type: "execute_trade" },
          ],
        },
        {
          kind: "category",
          name: "Indicators",
          colour: "290",
          contents: [
            { kind: "block", type: "indicator_rsi" },
            { kind: "block", type: "indicator_ma" },
          ],
        },
        {
          kind: "category",
          name: "Sell Conditions",
          colour: "20",
          contents: [
            { kind: "block", type: "sell_condition" },
          ],
        },
        {
          kind: "category",
          name: "Restart Trading",
          colour: "120",
          contents: [
            { kind: "block", type: "restart_trading" },
          ],
        },
        {
          kind: "category",
          name: "Logic",
          colour: "210",
          contents: [
            { kind: "block", type: "controls_if" },
            { kind: "block", type: "logic_compare" },
            { kind: "block", type: "logic_operation" },
            { kind: "block", type: "logic_boolean" },
          ],
        },
        {
          kind: "category",
          name: "Math",
          colour: "230",
          contents: [
            { kind: "block", type: "math_number" },
            { kind: "block", type: "math_arithmetic" },
            { kind: "block", type: "math_single" },
          ],
        },
        {
          kind: "category",
          name: "Variables",
          colour: "330",
          custom: "VARIABLE",
        },
      ],
    };

    // Initialize Blockly workspace
    const workspace = Blockly.inject(blocklyDiv.current, {
      toolbox: toolbox,
      grid: {
        spacing: 20,
        length: 3,
        colour: "#ccc",
        snap: true,
      },
      zoom: {
        controls: true,
        wheel: true,
        startScale: 1.0,
        maxScale: 3,
        minScale: 0.3,
        scaleSpeed: 1.2,
      },
      trashcan: true,
    });

    workspaceRef.current = workspace;

    // Load initial XML if provided
    if (initialXml) {
      try {
        const xml = Blockly.utils.xml.textToDom(initialXml);
        Blockly.Xml.domToWorkspace(xml, workspace);
      } catch (error) {
        console.error("Error loading initial XML:", error);
      }
    }

    // Listen for workspace changes
    workspace.addChangeListener(() => {
      if (onWorkspaceChange) {
        const xml = Blockly.Xml.workspaceToDom(workspace);
        const xmlText = Blockly.Xml.domToText(xml);
        onWorkspaceChange(xmlText);
      }
    });

    // Cleanup
    return () => {
      workspace.dispose();
    };
  }, []);

  return (
    <div
      ref={blocklyDiv}
      className="w-full h-full"
      style={{ minHeight: "500px" }}
    />
  );
}
