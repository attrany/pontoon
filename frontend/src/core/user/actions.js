/* @flow */

import api from 'core/api';

export const UPDATE: 'user/UPDATE' = 'user/UPDATE';
export const UPDATE_SETTINGS: 'user/UPDATE_SETTINGS' = 'user/UPDATE_SETTINGS';


export type Settings = {
    runQualityChecks?: boolean,
    forceSuggestions?: boolean,
};


/**
 * Update the user settings.
 */
export type UpdateSettingsAction = {|
    +type: typeof UPDATE_SETTINGS,
    +settings: Settings,
|};
export function updateSettings(settings: Settings): UpdateSettingsAction {
    return {
        type: UPDATE_SETTINGS,
        settings,
    };
}


/**
 * Update the user data.
 */
export type UpdateAction = {|
    +type: typeof UPDATE,
    +data: Object,
|};
export function update(data: Object): UpdateAction {
    return {
        type: UPDATE,
        data,
    };
}


/**
 * Sign out the current user.
 */
export function signOut(url: string): Function {
    return async dispatch => {
        await api.user.signOut(url);

        dispatch(get());
    }
}


export function saveSetting(setting: string, value: boolean, username: string): Function {
    return async dispatch => {
        dispatch(updateSettings({ [setting]: value }));

        await api.user.updateSetting(username, setting, value);
    };
}


export function markAllNotificationsAsRead(): Function {
    return async dispatch => {
        await api.user.markAllNotificationsAsRead();

        dispatch(get());
    }
}


/**
 * Get data about the current user from the server.
 *
 * This will fetch data about whether the user is authenticated or not,
 * and if so, get their information and permissions.
 */
export function get(): Function {
    return async dispatch => {
        const content = await api.user.get();
        dispatch(update(content));
    }
}


export default {
    get,
    markAllNotificationsAsRead,
    saveSetting,
    signOut,
    update,
    updateSettings,
};
