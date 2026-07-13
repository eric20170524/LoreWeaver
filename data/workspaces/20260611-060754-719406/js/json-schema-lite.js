const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function resolvePointer(schema, ref) {
    if (!ref.startsWith("#/")) throw new Error(`Unsupported schema reference: ${ref}`);
    return ref.slice(2).split("/").reduce((value, part) => value?.[part.replace(/~1/g, "/").replace(/~0/g, "~")], schema);
}

function matchesType(value, type) {
    if (type === "null") return value === null;
    if (type === "object") return isObject(value);
    if (type === "array") return Array.isArray(value);
    if (type === "integer") return Number.isInteger(value);
    if (type === "number") return typeof value === "number" && Number.isFinite(value);
    return typeof value === type;
}

export function validateJsonSchemaRule(schema, rule, value) {
    const errors = [];
    const visit = (currentRule, current, instancePath) => {
        if (currentRule.$ref) return visit(resolvePointer(schema, currentRule.$ref), current, instancePath);
        if (Array.isArray(currentRule.anyOf)) {
            const branches = currentRule.anyOf.map(branch => {
                const before = errors.length;
                visit(branch, current, instancePath);
                return errors.splice(before);
            });
            if (branches.every(branch => branch.length > 0)) errors.push(`${instancePath} must match one anyOf branch`);
            return;
        }
        if (currentRule.const !== undefined && !Object.is(current, currentRule.const)) errors.push(`${instancePath} must equal ${JSON.stringify(currentRule.const)}`);
        if (Array.isArray(currentRule.enum) && !currentRule.enum.some(item => Object.is(item, current))) errors.push(`${instancePath} must be one of ${currentRule.enum.join(", ")}`);
        if (currentRule.type !== undefined) {
            const types = Array.isArray(currentRule.type) ? currentRule.type : [currentRule.type];
            if (!types.some(type => matchesType(current, type))) {
                errors.push(`${instancePath} must be ${types.join(" or ")}`);
                return;
            }
        }
        if (typeof current === "number") {
            if (!Number.isFinite(current)) errors.push(`${instancePath} must be finite`);
            if (currentRule.minimum !== undefined && current < currentRule.minimum) errors.push(`${instancePath} must be >= ${currentRule.minimum}`);
            if (currentRule.maximum !== undefined && current > currentRule.maximum) errors.push(`${instancePath} must be <= ${currentRule.maximum}`);
        }
        if (typeof current === "string" && currentRule.minLength !== undefined && current.length < currentRule.minLength) errors.push(`${instancePath} must have length >= ${currentRule.minLength}`);
        if (Array.isArray(current)) {
            if (currentRule.uniqueItems === true && new Set(current.map(item => JSON.stringify(item))).size !== current.length) errors.push(`${instancePath} must contain unique items`);
            if (currentRule.items) current.forEach((item, index) => visit(currentRule.items, item, `${instancePath}/${index}`));
        }
        if (!isObject(current)) return;
        for (const key of currentRule.required || []) if (!(key in current)) errors.push(`${instancePath}/${key} is required`);
        const matched = new Set();
        for (const [key, childRule] of Object.entries(currentRule.properties || {})) if (key in current) {
            matched.add(key);
            visit(childRule, current[key], `${instancePath}/${key}`);
        }
        for (const [pattern, childRule] of Object.entries(currentRule.patternProperties || {})) {
            const regex = new RegExp(pattern);
            for (const [key, child] of Object.entries(current)) if (regex.test(key)) {
                matched.add(key);
                visit(childRule, child, `${instancePath}/${key}`);
            }
        }
        for (const [key, child] of Object.entries(current)) {
            if (matched.has(key)) continue;
            if (currentRule.additionalProperties === false) errors.push(`${instancePath}/${key} is not allowed`);
            else if (isObject(currentRule.additionalProperties)) visit(currentRule.additionalProperties, child, `${instancePath}/${key}`);
        }
    };
    visit(rule, value, "$");
    return { valid: errors.length === 0, errors };
}

export function validateJsonSchema(schema, value) {
    return validateJsonSchemaRule(schema, schema, value);
}
