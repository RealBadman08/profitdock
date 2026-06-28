let scratch_utils_promise: Promise<any> | null = null;
let dbot_promise: Promise<any> | null = null;

export const getScratchUtils = async () => {
    if (!scratch_utils_promise) {
        scratch_utils_promise = import('@/external/bot-skeleton/scratch/utils');
    }

    return scratch_utils_promise;
};

export const getDBot = async () => {
    if (!dbot_promise) {
        dbot_promise = import('@/external/bot-skeleton/scratch/dbot');
    }

    const module = await dbot_promise;
    return module.default;
};
