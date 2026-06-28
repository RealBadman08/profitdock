import localForage from 'localforage';
import LZString from 'lz-string';
import { config } from '../constants';
import { save_types } from '../constants/save-type';
import DBotStore from '../scratch/dbot-store';

const withTimeout = async (promise, fallback_value, timeout_ms = 1800, label = 'storage operation') => {
    let timeout_id;

    const timeout_promise = new Promise(resolve => {
        timeout_id = window.setTimeout(() => {
            console.warn(`[Blockly Storage] ${label} timed out. Falling back to a safe default.`);
            resolve(fallback_value);
        }, timeout_ms);
    });

    try {
        return await Promise.race([promise, timeout_promise]);
    } finally {
        window.clearTimeout(timeout_id);
    }
};

/**
 * Save workspace to localStorage
 * @param {String} save_type // constants/save_types.js (unsaved, local, googledrive)
 * @param {window.Blockly.Events} event // Blockly event object
 */
export const saveWorkspaceToRecent = async (xml, save_type = save_types.UNSAVED) => {
    const xml_dom = convertStrategyToIsDbot(xml);
    // Ensure strategies don't go through expensive conversion.
    xml.setAttribute('is_dbot', true);
    const {
        load_modal: { updateListStrategies },
        save_modal,
    } = DBotStore.instance;

    const workspace_id = window.Blockly.derivWorkspace.current_strategy_id || window.Blockly.utils.idGenerator.genUid();
    const workspaces = await getSavedWorkspaces();
    const current_xml = Blockly.Xml.domToText(xml_dom);
    const current_timestamp = Date.now();
    const current_workspace_index = workspaces.findIndex(workspace => workspace.id === workspace_id);

    if (current_workspace_index >= 0) {
        const current_workspace = workspaces[current_workspace_index];
        current_workspace.xml = current_xml;
        current_workspace.name = save_modal.bot_name;
        current_workspace.timestamp = current_timestamp;
        current_workspace.save_type = save_type;
    } else {
        workspaces.push({
            id: workspace_id,
            timestamp: current_timestamp,
            name: save_modal.bot_name || config().default_file_name,
            xml: current_xml,
            save_type,
        });
    }

    workspaces
        .sort((a, b) => {
            return new Date(a.timestamp) - new Date(b.timestamp);
        })
        .reverse();

    if (workspaces.length > 10) {
        workspaces.pop();
    }
    updateListStrategies(workspaces);
    await withTimeout(
        localForage.setItem('saved_workspaces', LZString.compress(JSON.stringify(workspaces))),
        null,
        1800,
        'Saving recent workspaces'
    );
};

export const getSavedWorkspaces = async () => {
    try {
        const compressed_workspaces = await withTimeout(
            localForage.getItem('saved_workspaces'),
            null,
            1800,
            'Loading saved workspaces'
        );

        if (!compressed_workspaces) {
            return [];
        }

        const decompressed_workspaces = LZString.decompress(compressed_workspaces);
        return JSON.parse(decompressed_workspaces) || [];
    } catch (e) {
        console.warn('[Blockly Storage] Failed to load saved workspaces. Resetting to an empty list.', e);
        return [];
    }
};

export const removeExistingWorkspace = async workspace_id => {
    const workspaces = await getSavedWorkspaces();
    const current_workspace_index = workspaces.findIndex(workspace => workspace.id === workspace_id);

    if (current_workspace_index >= 0) {
        workspaces.splice(current_workspace_index, 1);
    }

    await withTimeout(
        localForage.setItem('saved_workspaces', LZString.compress(JSON.stringify(workspaces))),
        null,
        1800,
        'Removing a saved workspace'
    );
};

export const convertStrategyToIsDbot = xml_dom => {
    if (!xml_dom) return;
    if (xml_dom.hasAttribute('collection') && xml_dom.getAttribute('collection') === 'true') {
        xml_dom.setAttribute('collection', 'true');
    }
    xml_dom.setAttribute('is_dbot', 'true');
    return xml_dom;
};
