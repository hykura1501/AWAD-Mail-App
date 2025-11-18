package usecase

import (
	emaildomain "ga03-backend/internal/email/domain"
	"ga03-backend/internal/email/repository"
)

// emailUsecase implements EmailUsecase interface
type emailUsecase struct {
	emailRepo repository.EmailRepository
}

// NewEmailUsecase creates a new instance of emailUsecase
func NewEmailUsecase(emailRepo repository.EmailRepository) EmailUsecase {
	return &emailUsecase{
		emailRepo: emailRepo,
	}
}

func (u *emailUsecase) GetAllMailboxes() ([]*emaildomain.Mailbox, error) {
	return u.emailRepo.GetAllMailboxes()
}

func (u *emailUsecase) GetMailboxByID(id string) (*emaildomain.Mailbox, error) {
	return u.emailRepo.GetMailboxByID(id)
}

func (u *emailUsecase) GetEmailsByMailbox(mailboxID string, limit, offset int) ([]*emaildomain.Email, int, error) {
	return u.emailRepo.GetEmailsByMailbox(mailboxID, limit, offset)
}

func (u *emailUsecase) GetEmailByID(id string) (*emaildomain.Email, error) {
	return u.emailRepo.GetEmailByID(id)
}

func (u *emailUsecase) MarkEmailAsRead(id string) error {
	email, err := u.emailRepo.GetEmailByID(id)
	if err != nil {
		return err
	}

	if email == nil {
		return nil
	}

	email.IsRead = true
	return u.emailRepo.UpdateEmail(email)
}

func (u *emailUsecase) ToggleStar(id string) error {
	email, err := u.emailRepo.GetEmailByID(id)
	if err != nil {
		return err
	}

	if email == nil {
		return nil
	}

	email.IsStarred = !email.IsStarred
	return u.emailRepo.UpdateEmail(email)
}

