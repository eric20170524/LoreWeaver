export function resolveShieldAbsorption(shield, damage) {
    const absorbed = Math.min(shield, damage);
    const remainingDamage = damage - absorbed;
    return { shield: shield - absorbed, absorbed, remainingDamage, fullyAbsorbed: remainingDamage === 0 };
}
