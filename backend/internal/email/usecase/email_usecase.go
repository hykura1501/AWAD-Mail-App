package usecase

import (
	"context"
	authrepo "ga03-backend/internal/auth/repository"
	emaildomain "ga03-backend/internal/email/domain"
	"ga03-backend/internal/email/repository"
	"mime/multipart"

	"golang.org/x/oauth2"
)

// emailUsecase implements EmailUsecase interface
type emailUsecase struct {
	emailRepo    repository.EmailRepository
	userRepo     authrepo.UserRepository
	mailProvider emaildomain.MailProvider
	topicName    string
}

// NewEmailUsecase creates a new instance of emailUsecase
func NewEmailUsecase(emailRepo repository.EmailRepository, userRepo authrepo.UserRepository, mailProvider emaildomain.MailProvider, topicName string) EmailUsecase {
	return &emailUsecase{
		emailRepo:    emailRepo,
		userRepo:     userRepo,
		mailProvider: mailProvider,
		topicName:    topicName,
	}
}

func (u *emailUsecase) getUserTokens(userID string) (string, string, error) {
	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return "", "", err
	}
	if user == nil {
		return "", "", nil
	}
	return user.AccessToken, user.RefreshToken, nil
}

func (u *emailUsecase) makeTokenUpdateCallback(userID string) emaildomain.TokenUpdateFunc {
	return func(token *oauth2.Token) error {
		user, err := u.userRepo.FindByID(userID)
		if err != nil {
			return err
		}
		if user == nil {
			return nil
		}

		user.AccessToken = token.AccessToken
		if token.RefreshToken != "" {
			user.RefreshToken = token.RefreshToken
		}
		user.TokenExpiry = token.Expiry
		
		return u.userRepo.Update(user)
	}
}

func (u *emailUsecase) GetAllMailboxes(userID string) ([]*emaildomain.Mailbox, error) {
	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return nil, err
	}
	
	if accessToken == "" {
		// Fallback to local storage if no access token
		return u.emailRepo.GetAllMailboxes()
	}
	
	ctx := context.Background()
	return u.mailProvider.GetMailboxes(ctx, accessToken, refreshToken, u.makeTokenUpdateCallback(userID))
}

func (u *emailUsecase) GetMailboxByID(id string) (*emaildomain.Mailbox, error) {
	return u.emailRepo.GetMailboxByID(id)
}

func (u *emailUsecase) GetEmailsByMailbox(userID, mailboxID string, limit, offset int, query string) ([]*emaildomain.Email, int, error) {
	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return nil, 0, err
	}
	
	if accessToken == "" {
		// Fallback to local storage if no access token
		return u.emailRepo.GetEmailsByMailbox(mailboxID, limit, offset)
	}
	
	ctx := context.Background()
	return u.mailProvider.GetEmails(ctx, accessToken, refreshToken, mailboxID, limit, offset, query, u.makeTokenUpdateCallback(userID))
}

func (u *emailUsecase) GetAttachment(userID, messageID, attachmentID string) (*emaildomain.Attachment, []byte, error) {
	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return nil, nil, err
	}
	
	if accessToken == "" {
		return nil, nil, nil // Not supported for local storage yet
	}
	
	ctx := context.Background()
	return u.mailProvider.GetAttachment(ctx, accessToken, refreshToken, messageID, attachmentID, u.makeTokenUpdateCallback(userID))
}

func (u *emailUsecase) GetEmailByID(userID, id string) (*emaildomain.Email, error) {
	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return nil, err
	}
	
	if accessToken == "" {
		// Fallback to local storage if no access token
		return u.emailRepo.GetEmailByID(id)
	}
	
	ctx := context.Background()
	return u.mailProvider.GetEmailByID(ctx, accessToken, refreshToken, id, u.makeTokenUpdateCallback(userID))
}

func (u *emailUsecase) MarkEmailAsRead(userID, id string) error {
	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return err
	}
	
	if accessToken == "" {
		// Fallback to local storage if no access token
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
	
	ctx := context.Background()
	return u.mailProvider.MarkAsRead(ctx, accessToken, refreshToken, id, u.makeTokenUpdateCallback(userID))
}

func (u *emailUsecase) MarkEmailAsUnread(userID, id string) error {
	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return err
	}
	
	if accessToken == "" {
		// Fallback to local storage if no access token
		email, err := u.emailRepo.GetEmailByID(id)
		if err != nil {
			return err
		}
		if email == nil {
			return nil
		}
		email.IsRead = false
		return u.emailRepo.UpdateEmail(email)
	}
	
	ctx := context.Background()
	return u.mailProvider.MarkAsUnread(ctx, accessToken, refreshToken, id, u.makeTokenUpdateCallback(userID))
}

func (u *emailUsecase) ToggleStar(userID, id string) error {
	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return err
	}
	
	if accessToken == "" {
		// Fallback to local storage if no access token
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
	
	ctx := context.Background()
	return u.mailProvider.ToggleStar(ctx, accessToken, refreshToken, id, u.makeTokenUpdateCallback(userID))
}

func (u *emailUsecase) SendEmail(userID, to, subject, body string, files []*multipart.FileHeader) error {
	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return err
	}
	
	if accessToken == "" {
		return nil // Not supported for local storage yet
	}
	
	ctx := context.Background()
	return u.mailProvider.SendEmail(ctx, accessToken, refreshToken, to, subject, body, files, u.makeTokenUpdateCallback(userID))
}

func (u *emailUsecase) TrashEmail(userID, id string) error {
	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return err
	}
	
	if accessToken == "" {
		// Fallback to local storage
		return nil
	}
	
	ctx := context.Background()
	return u.mailProvider.TrashEmail(ctx, accessToken, refreshToken, id, u.makeTokenUpdateCallback(userID))
}

func (u *emailUsecase) ArchiveEmail(userID, id string) error {
	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return err
	}
	
	if accessToken == "" {
		// Fallback to local storage
		return nil
	}
	
	ctx := context.Background()
	return u.mailProvider.ArchiveEmail(ctx, accessToken, refreshToken, id, u.makeTokenUpdateCallback(userID))
}

func (u *emailUsecase) WatchMailbox(userID string) error {
	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return err
	}
	
	if accessToken == "" {
		// Fallback to local storage
		return nil
	}
	
	ctx := context.Background()
	return u.mailProvider.Watch(ctx, accessToken, refreshToken, u.topicName, u.makeTokenUpdateCallback(userID))
}

