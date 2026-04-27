using System.Threading.Tasks;
namespace ServerUndercover.Services
{
    public interface IUserService
    {
        Task<object> GetUserProfile(string userId);
    }
}
