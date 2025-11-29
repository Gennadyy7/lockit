use anchor_lang::prelude::*;

declare_id!("CB81GRLWi7AjR6KDFawvbzfH3xQkCQh5YZznA7XzS7q6");

pub const VAULT_SEED: &[u8] = b"vault";

#[program]
pub mod lockit {
    use super::*;

    pub fn create_vault(ctx: Context<CreateVault>, unlock_days: u64) -> Result<()> {
        require!(unlock_days >= 1 && unlock_days <= 365, LockItError::InvalidDays);

        let vault = &mut ctx.accounts.vault;
        let clock = Clock::get()?;

        vault.owner = ctx.accounts.user.key();
        vault.balance = 0;
        vault.unlock_time = clock.unix_timestamp + (unlock_days as i64) * 86_400;
        vault.bump = ctx.bumps.vault;

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require_gt!(amount, 0, LockItError::ZeroAmount);
        require_keys_eq!(ctx.accounts.user.key(), ctx.accounts.vault.owner, LockItError::NotOwner);

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        let vault = &mut ctx.accounts.vault;
        vault.balance = vault.balance
            .checked_add(amount)
            .ok_or(LockItError::MathOverflow)?;

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let clock = Clock::get()?;
        require_keys_eq!(ctx.accounts.user.key(), ctx.accounts.vault.owner, LockItError::NotOwner);
        require!(clock.unix_timestamp >= ctx.accounts.vault.unlock_time, LockItError::StillLocked);
        require_gt!(ctx.accounts.vault.balance, 0, LockItError::ZeroBalance);

        let amount = ctx.accounts.vault.balance;

        let vault_info = ctx.accounts.vault.to_account_info();
        let user_info = ctx.accounts.user.to_account_info();

        **vault_info.try_borrow_mut_lamports()? -= amount;
        **user_info.try_borrow_mut_lamports()? += amount;

        let vault = &mut ctx.accounts.vault;
        vault.balance = 0;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateVault<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 8 + 8 + 1,
        seeds = [VAULT_SEED, user.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, user.key().as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [VAULT_SEED, user.key().as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub user: Signer<'info>,
}

#[account]
pub struct Vault {
    pub owner: Pubkey,
    pub balance: u64,
    pub unlock_time: i64,
    pub bump: u8,
}

#[error_code]
pub enum LockItError {
    #[msg("Unlock period must be 1–365 days")]
    InvalidDays,
    #[msg("Amount must be > 0")]
    ZeroAmount,
    #[msg("Not the vault owner")]
    NotOwner,
    #[msg("Funds are still locked")]
    StillLocked,
    #[msg("Vault is empty")]
    ZeroBalance,
    #[msg("Math overflow")]
    MathOverflow,
}
