import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import * as Blockly from "blockly";
import "blockly/blocks";

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
      this.setColour("#FFC000"); // Yellow
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
          ["Lower", "PUTE"],
          ["Matches", "DIGITMATCH"],
          ["Differs", "DIGITDIFF"]
        ]), "TYPE");
      this.appendStatementInput("CONDITIONS")
        .setCheck(null)
        .appendField("Conditions:");
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour("#E53935"); // Red
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
      this.setColour("#4CAF50"); // Green
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
      this.setColour("#4CAF50"); // Green
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
      this.setColour("#000000"); // Black
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
      this.setColour("#2196F3"); // Blue
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
      this.setColour("#E53935"); // Red
      this.setTooltip("Execute a trade");
      this.setHelpUrl("");
    }
  };
};

interface BlocklyWorkspaceProps {
  onWorkspaceChange?: (xml: string) => void;
  initialXml?: string;
}

export interface BlocklyWorkspaceRef {
  loadXml: (xml: string) => void;
}

const BlocklyWorkspace = forwardRef<BlocklyWorkspaceRef, BlocklyWorkspaceProps>(({ onWorkspaceChange, initialXml }, ref) => {
  const blocklyDiv = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);

  useImperativeHandle(ref, () => ({
    loadXml: (xmlString: string) => {
      if (workspaceRef.current) {
        try {
          workspaceRef.current.clear();
          const xml = Blockly.utils.xml.textToDom(xmlString);
          Blockly.Xml.domToWorkspace(xml, workspaceRef.current);
          console.log("XML Loaded successfully");
        } catch (error) {
          console.error("Error loading XML:", error);
        }
      }
    }
  }));

  useEffect(() => {
    if (!blocklyDiv.current) return;

    // Define custom blocks
    defineCustomBlocks();

    // DBot Fidelity Toolbox
    const toolbox = {
      kind: "categoryToolbox",
      contents: [
        {
          kind: "category",
          name: "Trade Parameters",
          categorystyle: "trade_parameters_category",
          contents: [
            { kind: "block", type: "trade_parameters" },
          ],
        },
        {
          kind: "category",
          name: "Purchase Conditions",
          categorystyle: "purchase_conditions_category",
          contents: [
            { kind: "block", type: "purchase_condition" },
            { kind: "block", type: "execute_trade" },
          ],
        },
        {
          kind: "category",
          name: "Indicators",
          categorystyle: "indicators_category",
          contents: [
            { kind: "block", type: "indicator_rsi" },
            { kind: "block", type: "indicator_ma" },
          ],
        },
        {
          kind: "category",
          name: "Sell Conditions",
          categorystyle: "sell_conditions_category",
          contents: [
            { kind: "block", type: "sell_condition" },
          ],
        },
        {
          kind: "category",
          name: "Restart Trading",
          categorystyle: "restart_trading_category",
          contents: [
            { kind: "block", type: "restart_trading" },
          ],
        },
        {
          kind: "category",
          name: "Logic",
          categorystyle: "logic_category",
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
          categorystyle: "math_category",
          contents: [
            { kind: "block", type: "math_number" },
            { kind: "block", type: "math_arithmetic" },
            { kind: "block", type: "math_single" },
          ],
        },
        {
          kind: "category",
          name: "Variables",
          categorystyle: "variables_category",
          custom: "VARIABLE",
        },
      ],
    };

    // Verify if theme is already defined to avoid errors
    // @ts-ignore
    const existingTheme = Blockly.Theme.registry?.['dark'];
    const darkTheme = existingTheme || Blockly.Theme.defineTheme('dark', {
      base: Blockly.Themes.Classic,
      componentStyles: {
        workspaceBackgroundColour: '#0E0E0E',
        toolboxBackgroundColour: '#151717',
        toolboxForegroundColour: '#FFFFFF',
        flyoutBackgroundColour: '#1A1A1A',
        flyoutForegroundColour: '#FFFFFF',
        flyoutOpacity: 1,
        scrollbarColour: '#333333',
        insertionMarkerColour: '#FF444F',
        insertionMarkerOpacity: 0.3,
        scrollbarOpacity: 0.4,
        cursorColour: '#FFFFFF',
        // blackBackground: '#333', // Removed invalid property
      },
      blockStyles: {
        // Standard blocks
      },
      categoryStyles: {
        "trade_parameters_category": { "colour": "#FFC000" }, // Yellow
        "purchase_conditions_category": { "colour": "#E53935" }, // Red
        "sell_conditions_category": { "colour": "#99ABB4" }, // Grey/Black
        "restart_trading_category": { "colour": "#2196F3" }, // Blue
        "indicators_category": { "colour": "#4CAF50" }, // Green
        "logic_category": { "colour": "#FF9800" }, // Orange
        "math_category": { "colour": "#9C27B0" }, // Purple
        "variables_category": { "colour": "#E91E63" }, // Pink
      }
    });

    // Initialize Blockly workspace
    const workspace = Blockly.inject(blocklyDiv.current, {
      toolbox: toolbox,
      // @ts-ignore
      theme: darkTheme,
      grid: {
        spacing: 20,
        length: 3,
        colour: "#333", // Dark grid dots
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
});

export default BlocklyWorkspace;
